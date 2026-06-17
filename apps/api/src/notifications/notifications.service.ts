import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { NotificationChannel, NotificationStatus, RoleName, UserStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { GmailAdapter } from './gmail.adapter';
import { NOTIFICATION_QUEUE } from './notifications.processor';
import { NotificationEvent, NotificationJob, RecipientRole } from './notification-job.interface';

interface Recipient {
  email: string;
  name:  string;
  role:  RecipientRole;
}

interface EmitExtra {
  commentBody?:         string;
  actorName?:           string;
  actorEmail?:          string; // excluded from recipient list to avoid self-notification
  slaRemainingMinutes?: number;
}

// Ticket shape returned by the internal findTicket query
type TicketRow = {
  id:          string;
  subject:     string;
  status:      string;
  requester:   { email: string; name: string | null };
  assignee:    { email: string; name: string | null } | null;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly gmail: GmailAdapter,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * High-level entry point. Looks up the ticket, resolves recipients based on
   * event type, persists one Notification record per recipient, and enqueues
   * one BullMQ job per recipient.
   */
  async emit(event: NotificationEvent, ticketId: string, extra?: EmitExtra): Promise<void> {
    let ticket: TicketRow | null;
    try {
      ticket = await this.prisma.ticket.findUnique({
        where:   { id: ticketId },
        select: {
          id:       true,
          subject:  true,
          status:   true,
          requester: { select: { email: true, name: true } },
          assignee:  { select: { email: true, name: true } },
        },
      });
    } catch (err) {
      this.logger.error(`emit(${event}, ${ticketId}): DB lookup failed — ${(err as Error).message}`);
      return;
    }

    if (!ticket) {
      this.logger.warn(`emit(${event}): ticket ${ticketId} not found — skipping`);
      return;
    }

    const recipients = await this.resolveRecipients(event, ticket, extra?.actorEmail);

    if (recipients.length === 0) {
      this.logger.debug(`emit(${event}, ${ticketId}): no recipients resolved — nothing enqueued`);
      return;
    }

    for (const recipient of recipients) {
      await this.persistAndEnqueue(event, ticket, recipient, extra);
    }
  }

  // ── Recipient routing ─────────────────────────────────────────────────────

  private async resolveRecipients(
    event: NotificationEvent,
    ticket: TicketRow,
    actorEmail?: string,
  ): Promise<Recipient[]> {
    const requester: Recipient = {
      email: ticket.requester.email,
      name:  ticket.requester.name ?? 'User',
      role:  'requester',
    };
    const assignee: Recipient | null = ticket.assignee
      ? { email: ticket.assignee.email, name: ticket.assignee.name ?? 'Agent', role: 'assignee' }
      : null;

    let candidates: Recipient[];

    switch (event) {
      case 'ticket.created':
        // Employee confirmation + IT_ADMIN new-ticket alert
        candidates = [requester, ...(await this.getUsersByRole(RoleName.IT_ADMIN, 'admin'))];
        break;

      case 'ticket.assigned':
        // Agent assignment notification
        candidates = assignee ? [assignee] : [];
        break;

      case 'ticket.status_changed':
        // Employee status update
        candidates = [requester];
        break;

      case 'ticket.comment_added':
        // Employee comment notification
        candidates = [requester];
        break;

      case 'ticket.sla_warning':
        // Assigned agent only
        candidates = assignee ? [assignee] : [];
        break;

      case 'ticket.escalated':
        // IT_ADMINs + MANAGERs
        candidates = [
          ...(await this.getUsersByRole(RoleName.IT_ADMIN, 'admin')),
          ...(await this.getUsersByRole(RoleName.MANAGER, 'manager')),
        ];
        break;

      case 'ticket.resolved':
        candidates = [requester];
        break;

      case 'ticket.closed':
        candidates = [requester];
        break;

      case 'ticket.reopened':
        // Agent reopen alert
        candidates = assignee ? [assignee] : [];
        break;

      default:
        candidates = [];
    }

    // Deduplicate by email and exclude the actor (avoid notifying someone about their own action)
    const seen = new Set<string>(actorEmail ? [actorEmail] : []);
    const unique: Recipient[] = [];
    for (const r of candidates) {
      if (!seen.has(r.email)) {
        seen.add(r.email);
        unique.push(r);
      }
    }
    return unique;
  }

  private async getUsersByRole(role: RoleName, recipientRole: RecipientRole): Promise<Recipient[]> {
    const users = await this.prisma.user.findMany({
      where: {
        userRoles: { some: { role: { name: role } } },
        status:    UserStatus.ACTIVE,
      },
      select: { email: true, name: true },
    });
    return users.map(u => ({ email: u.email, name: u.name, role: recipientRole }));
  }

  // ── Ad-hoc email (non-ticket, e.g. device decisions) ─────────────────────

  async sendAdHoc(
    to:       string,
    toName:   string,
    event:    string,
    subject:  string,
    html:     string,
    text:     string,
    cc?:      string[],
  ): Promise<void> {
    let notificationId: string | null = null;
    try {
      const record = await this.prisma.notification.create({
        data: {
          ticketId:       null,
          recipientEmail: to,
          channel:        NotificationChannel.EMAIL,
          event,
          status:         NotificationStatus.PENDING,
        },
        select: { id: true },
      });
      notificationId = record.id;
    } catch (err) {
      this.logger.error(`sendAdHoc: failed to persist notification → ${to}: ${(err as Error).message}`);
    }

    try {
      await this.gmail.send(to, subject, html, text, cc);
      if (notificationId) {
        await this.prisma.notification.update({
          where: { id: notificationId },
          data:  { status: NotificationStatus.SENT, sentAt: new Date() },
        });
      }
    } catch (err) {
      this.logger.error(`sendAdHoc: email failed → ${to} | ${event}: ${(err as Error).message}`);
      if (notificationId) {
        await this.prisma.notification.update({
          where: { id: notificationId },
          data:  { status: NotificationStatus.FAILED },
        }).catch(() => undefined);
      }
    }
  }

  // ── Persistence + enqueue ─────────────────────────────────────────────────

  private async persistAndEnqueue(
    event:     NotificationEvent,
    ticket:    TicketRow,
    recipient: Recipient,
    extra?:    EmitExtra,
  ): Promise<void> {
    let notificationId: string;
    try {
      const record = await this.prisma.notification.create({
        data: {
          ticketId:       ticket.id,
          recipientEmail: recipient.email,
          channel:        NotificationChannel.EMAIL,
          event,
          status:         NotificationStatus.PENDING,
        },
        select: { id: true },
      });
      notificationId = record.id;
    } catch (err) {
      this.logger.error(
        `Failed to persist Notification(${event}, ${recipient.email}): ${(err as Error).message}`,
      );
      return;
    }

    const job: NotificationJob = {
      notificationId,
      event,
      ticketId:       ticket.id,
      ticketSubject:  ticket.subject,
      ticketStatus:   ticket.status,
      recipientEmail: recipient.email,
      recipientName:  recipient.name,
      recipientRole:  recipient.role,
      requesterName:  ticket.requester.name ?? 'User',
      assigneeName:   ticket.assignee?.name ?? null,
      actorName:      extra?.actorName,
      commentBody:    extra?.commentBody,
      slaRemainingMinutes: extra?.slaRemainingMinutes,
    };

    try {
      await this.queue.add(event, job, {
        attempts:         3,
        backoff:          { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail:     500,
      });
    } catch (err) {
      // Enqueue failure: leave Notification as PENDING (a future cleanup job can retry)
      this.logger.error(
        `Failed to enqueue ${event} for ${recipient.email}: ${(err as Error).message}`,
      );
    }
  }

  // ── Admin helpers ─────────────────────────────────────────────────────────

  async listByStatus(status: NotificationStatus, limit = 100) {
    return this.prisma.notification.findMany({
      where:   { status },
      include: {
        ticket: { select: { id: true, subject: true } },
      },
      orderBy: { createdAt: 'desc' },
      take:    Math.min(limit, 500),
    });
  }
}
