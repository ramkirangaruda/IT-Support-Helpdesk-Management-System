import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SLA_CHECK_INTERVAL_MS, SLA_QUEUE_NAME, SlaJobType } from './sla.constants';

@Injectable()
export class SlaScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SlaScheduler.name);

  constructor(
    @InjectQueue(SLA_QUEUE_NAME) private readonly slaQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.registerRepeatableJob(SlaJobType.CHECK_SLA_WARNINGS);
    await this.registerRepeatableJob(SlaJobType.CHECK_ESCALATIONS);
    this.logger.log(`SLA repeatable jobs registered (interval: ${SLA_CHECK_INTERVAL_MS / 60_000}min)`);
  }

  private async registerRepeatableJob(jobName: SlaJobType): Promise<void> {
    // Remove any stale definitions with the same key before (re-)adding,
    // so restarts don't accumulate duplicate repeatable entries.
    const existing = await this.slaQueue.getRepeatableJobs();
    const stale = existing.filter(j => j.name === jobName);
    for (const job of stale) {
      await this.slaQueue.removeRepeatableByKey(job.key);
    }

    await this.slaQueue.add(
      jobName,
      {},
      {
        repeat: { every: SLA_CHECK_INTERVAL_MS },
        jobId:  `sla:${jobName}`,
      },
    );

    this.logger.log(`Registered repeatable job: ${jobName}`);
  }
}
