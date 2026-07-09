import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { NotificationChannel, NotificationStatus, RoleName, UserStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EmailJobPayload, EmailMeta, NotificationEvent, RecipientRole } from './notification-job.interface';
import { NOTIFICATION_EMAIL_QUEUE_NAME, SEND_EMAIL_JOB } from './email.constants';

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
  oldStatus?:           string;
  newStatus?:           string;
}

type TicketRow = {
  id:        string;
  subject:   string;
  status:    string;
  requester: { email: string; name: string | null };
  assignee:  { email: string; name: string | null } | null;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_EMAIL_QUEUE_NAME) private readonly emailQueue: Queue,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  async emit(event: NotificationEvent, ticketId: string, extra?: EmitExtra): Promise<void> {
    let ticket: TicketRow | null;
    try {
      ticket = await this.prisma.ticket.findUnique({
        where:  { id: ticketId },
        select: {
          id:        true,
          subject:   true,
          status:    true,
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
      this.logger.debug(`emit(${event}, ${ticketId}): no recipients — skipping`);
      return;
    }

    for (const recipient of recipients) {
      try {
        // 1. In-app notification — created immediately, shows in bell
        await this.prisma.notification.create({
          data: {
            ticketId:       ticket.id,
            recipientEmail: recipient.email,
            channel:        NotificationChannel.IN_APP,
            event,
            status:         NotificationStatus.SENT,
            sentAt:         new Date(),
          },
        });
        this.logger.log(`Notification(${event}) → ${recipient.email}`);

        // 2. Email notification — queued for async delivery
        const emailRecord = await this.prisma.notification.create({
          data: {
            ticketId:       ticket.id,
            recipientEmail: recipient.email,
            channel:        NotificationChannel.EMAIL,
            event,
            status:         NotificationStatus.PENDING,
          },
        });

        const meta: EmailMeta = {
          toName:              recipient.name,
          actorName:           extra?.actorName,
          commentPreview:      extra?.commentBody ? extra.commentBody.slice(0, 200) : undefined,
          slaRemainingMinutes: extra?.slaRemainingMinutes,
          oldStatus:           extra?.oldStatus,
          newStatus:           extra?.newStatus,
        };

        await this.emailQueue.add(SEND_EMAIL_JOB, {
          notificationId: emailRecord.id,
          to:             recipient.email,
          event,
          ticketId:       ticket.id,
          recipientRole:  recipient.role,
          meta,
        } satisfies EmailJobPayload);

      } catch (err) {
        this.logger.error(
          `Failed to persist Notification(${event}, ${recipient.email}): ${(err as Error).message}`,
        );
      }
    }
  }

  // Ad-hoc notification for non-ticket events (user approvals, device decisions, etc.)
  async sendAdHoc(to: string, event: string, meta?: EmailMeta): Promise<void> {
    try {
      // 1. In-app notification
      await this.prisma.notification.create({
        data: {
          ticketId:       null,
          recipientEmail: to,
          channel:        NotificationChannel.IN_APP,
          event,
          status:         NotificationStatus.SENT,
          sentAt:         new Date(),
        },
      });
      this.logger.log(`Notification(${event}) → ${to}`);

      // 2. Email notification
      const emailRecord = await this.prisma.notification.create({
        data: {
          ticketId:       null,
          recipientEmail: to,
          channel:        NotificationChannel.EMAIL,
          event,
          status:         NotificationStatus.PENDING,
        },
      });

      await this.emailQueue.add(SEND_EMAIL_JOB, {
        notificationId: emailRecord.id,
        to,
        event,
        meta: meta ?? {},
      } satisfies EmailJobPayload);

    } catch (err) {
      this.logger.error(`sendAdHoc(${event} → ${to}): ${(err as Error).message}`);
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
        candidates = [requester, ...(await this.getUsersByRole(RoleName.IT_ADMIN, 'admin'))];
        break;
      case 'ticket.assigned':
        candidates = assignee ? [assignee] : [];
        break;
      case 'ticket.status_changed':
        candidates = [requester];
        break;
      case 'ticket.comment_added':
        candidates = [requester];
        break;
      case 'ticket.sla_warning':
        candidates = assignee ? [assignee] : [];
        break;
      case 'ticket.escalated':
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
        candidates = assignee ? [assignee] : [];
        break;
      default:
        candidates = [];
    }

    // Deduplicate by email and exclude the actor
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

  // ── Query helpers ─────────────────────────────────────────────────────────

  async listByStatus(status: NotificationStatus, limit = 100) {
    return this.prisma.notification.findMany({
      where:   { status },
      include: { ticket: { select: { id: true, subject: true } } },
      orderBy: { createdAt: 'desc' },
      take:    Math.min(limit, 500),
    });
  }

  async listForUser(email: string, limit = 15) {
    return this.prisma.notification.findMany({
      where: {
        recipientEmail: email,
        status:  NotificationStatus.SENT,
        channel: NotificationChannel.IN_APP,  // bell shows in-app only
      },
      include: { ticket: { select: { id: true, subject: true } } },
      orderBy: { createdAt: 'desc' },
      take:    Math.min(limit, 50),
    });
  }
}
