import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { GmailAdapter } from './gmail.adapter';
import { renderHtml, renderSubject, renderText } from './email-templates';
import { NotificationJob } from './notification-job.interface';

export const NOTIFICATION_QUEUE = 'notifications';

@Processor(NOTIFICATION_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly gmail: GmailAdapter,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  // ── Job handler ───────────────────────────────────────────────────────────

  async process(job: Job<NotificationJob>): Promise<void> {
    const { data } = job;
    this.logger.log(`Processing ${data.event} → ${data.recipientEmail} (attempt ${job.attemptsMade})`);

    const subject = renderSubject(data);
    const html    = renderHtml(data);
    const text    = renderText(data);

    // Throws on failure — BullMQ catches the throw, increments attemptsMade,
    // and reschedules according to the exponential backoff options.
    await this.gmail.send(data.recipientEmail, subject, html, text);

    // Mark as SENT and record how many attempts it took
    await this.prisma.notification.update({
      where: { id: data.notificationId },
      data: {
        status:     NotificationStatus.SENT,
        sentAt:     new Date(),
        retryCount: job.attemptsMade,
      },
    });

    this.logger.log(`Notification ${data.notificationId} SENT → ${data.recipientEmail}`);
  }

  // ── Final failure handler ─────────────────────────────────────────────────
  // @OnWorkerEvent('failed') fires only after all retry attempts are exhausted
  // (i.e., the job moves to the "failed" set). It does NOT fire on each retry.

  @OnWorkerEvent('failed')
  async onFailed(job: Job<NotificationJob> | undefined, error: Error): Promise<void> {
    if (!job?.data?.notificationId) return;

    this.logger.error(
      `ALERT: Notification ${job.data.notificationId} permanently failed after ` +
      `${job.attemptsMade} attempt(s) → ${job.data.recipientEmail} | ` +
      `event=${job.data.event} ticket=${job.data.ticketId} | ${error.message}`,
    );

    try {
      await this.prisma.notification.update({
        where: { id: job.data.notificationId },
        data: {
          status:     NotificationStatus.FAILED,
          retryCount: job.attemptsMade,
        },
      });
    } catch (dbErr) {
      this.logger.error(
        `Could not mark notification ${job.data.notificationId} as FAILED: ${(dbErr as Error).message}`,
      );
    }
  }
}
