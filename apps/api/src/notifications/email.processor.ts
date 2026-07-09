import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { NotificationStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SmtpAdapter } from './smtp.adapter';
import { buildEmail, TicketEmailData } from './email-templates';
import { EmailJobPayload } from './notification-job.interface';
import { NOTIFICATION_EMAIL_QUEUE_NAME } from './email.constants';

@Processor(NOTIFICATION_EMAIL_QUEUE_NAME)
@Injectable()
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly smtp:   SmtpAdapter,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<EmailJobPayload>): Promise<void> {
    const { notificationId, to, event, ticketId, recipientRole, meta = {} } = job.data;

    // Fetch ticket data if this is a ticket-scoped event
    let ticket: TicketEmailData | undefined;
    if (ticketId) {
      const t = await this.prisma.ticket.findUnique({
        where:  { id: ticketId },
        select: {
          id:              true,
          subject:         true,
          status:          true,
          priority:        true,
          escalationLevel: true,
          slaResolutionDue: true,
          category:   { select: { name: true } },
          requester:  { select: { name: true, email: true } },
          assignee:   { select: { name: true, email: true } },
        },
      });
      if (t) ticket = t;
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');
    const content = buildEmail(event, { ticket, recipientRole, meta }, frontendUrl);

    if (!content) {
      this.logger.debug(`No email template for event "${event}" — marking sent and skipping`);
      await this.updateStatus(notificationId, NotificationStatus.SENT);
      return;
    }

    try {
      await this.smtp.send(to, content.subject, content.html, content.text);
      await this.updateStatus(notificationId, NotificationStatus.SENT);
    } catch (err) {
      this.logger.error(
        `Email delivery failed for ${to} (${event}) after all retries: ${(err as Error).message}`,
      );
      await this.updateStatus(notificationId, NotificationStatus.FAILED, 3);
    }
  }

  private async updateStatus(
    id: string,
    status: NotificationStatus,
    retryCount?: number,
  ): Promise<void> {
    try {
      await this.prisma.notification.update({
        where: { id },
        data: {
          status,
          ...(status === NotificationStatus.SENT && { sentAt: new Date() }),
          ...(retryCount !== undefined && { retryCount }),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to update notification ${id} status to ${status}: ${(err as Error).message}`);
    }
  }
}
