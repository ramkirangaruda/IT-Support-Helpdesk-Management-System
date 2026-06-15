import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DevicesController } from './devices.controller';
import { DeviceRequestsController } from './device-requests.controller';
import { EmployeeDevicesController } from './employee-devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports:     [AuditModule, NotificationsModule],
  controllers: [DevicesController, DeviceRequestsController, EmployeeDevicesController],
  providers:   [DevicesService],
})
export class DevicesModule {}
