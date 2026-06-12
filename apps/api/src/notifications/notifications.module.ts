import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { GmailAdapter } from './gmail.adapter';
import { NotificationsProcessor, NOTIFICATION_QUEUE } from './notifications.processor';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  providers: [NotificationsService, NotificationsProcessor, GmailAdapter],
  exports: [NotificationsService],
})
export class NotificationsModule {}
