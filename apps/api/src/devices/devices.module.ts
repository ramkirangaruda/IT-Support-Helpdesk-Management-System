import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeviceReminderProcessor } from './device-reminder.processor';
import { DeviceReminderScheduler } from './device-reminder.scheduler';
import { DEVICE_QUEUE_NAME } from './device-reminder.constants';
import { DevicesController } from './devices.controller';
import { DeviceRequestsController } from './device-requests.controller';
import { EmployeeDevicesController } from './employee-devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: DEVICE_QUEUE_NAME }),
    AuditModule,
    NotificationsModule,
  ],
  controllers: [DevicesController, DeviceRequestsController, EmployeeDevicesController],
  providers:   [DevicesService, DeviceReminderProcessor, DeviceReminderScheduler],
})
export class DevicesModule {}
