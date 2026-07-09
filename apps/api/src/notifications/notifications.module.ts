import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmtpAdapter } from './smtp.adapter';
import { EmailProcessor } from './email.processor';
import { NOTIFICATION_EMAIL_QUEUE_NAME } from './email.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATION_EMAIL_QUEUE_NAME }),
  ],
  controllers: [NotificationsController],
  providers:   [NotificationsService, SmtpAdapter, EmailProcessor],
  exports:     [NotificationsService],
})
export class NotificationsModule {}
