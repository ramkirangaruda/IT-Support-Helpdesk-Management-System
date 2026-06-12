import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NOTIFICATION_QUEUE } from './notifications.processor';
import { NotificationJob } from './notification-job.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(job: NotificationJob): Promise<void> {
    try {
      await this.queue.add(job.event, job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    } catch (err) {
      // Enqueue failures must not break the HTTP response
      this.logger.error(`Failed to enqueue notification ${job.event}: ${(err as Error).message}`);
    }
  }
}
