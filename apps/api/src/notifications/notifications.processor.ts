import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from './email.service';
import { renderHtml, renderSubject } from './email-templates';
import { NotificationJob } from './notification-job.interface';

export const NOTIFICATION_QUEUE = 'notifications';

@Processor(NOTIFICATION_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    const data = job.data;
    this.logger.log(`Processing ${data.event} for ticket ${data.ticketId}`);

    const subject = renderSubject(data);
    const html    = renderHtml(data);

    // Always notify the requester
    await this.emailService.send(data.requesterEmail, subject, html);

    // Notify the assignee on assignment event
    if (data.event === 'ticket.assigned' && data.assigneeEmail) {
      const assigneeSubject = `[${data.ticketId}] You've been assigned a ticket`;
      const assigneeHtml = html.replace(
        `Hi ${data.requesterName}`,
        `Hi ${data.assigneeName ?? 'Agent'}`,
      );
      await this.emailService.send(data.assigneeEmail, assigneeSubject, assigneeHtml);
    }
  }
}
