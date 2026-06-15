import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DEVICE_QUEUE_NAME,
  DEVICE_REMINDER_CRON,
  DeviceJobType,
} from './device-reminder.constants';

@Injectable()
export class DeviceReminderScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeviceReminderScheduler.name);

  constructor(
    @InjectQueue(DEVICE_QUEUE_NAME) private readonly deviceQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Remove stale definitions so restarts don't accumulate duplicates
    const existing = await this.deviceQueue.getRepeatableJobs();
    for (const job of existing.filter(j => j.name === DeviceJobType.CHECK_DEVICE_LIMITS)) {
      await this.deviceQueue.removeRepeatableByKey(job.key);
    }

    await this.deviceQueue.add(
      DeviceJobType.CHECK_DEVICE_LIMITS,
      {},
      {
        repeat: { pattern: DEVICE_REMINDER_CRON },
        jobId:  `device:${DeviceJobType.CHECK_DEVICE_LIMITS}`,
      },
    );

    this.logger.log(
      `Device reminder job registered — cron: "${DEVICE_REMINDER_CRON}" (weekdays 09:00)`,
    );
  }
}
