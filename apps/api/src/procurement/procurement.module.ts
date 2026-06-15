import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PurchaseRequestController, VendorController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  imports:     [NotificationsModule],
  controllers: [PurchaseRequestController, VendorController],
  providers:   [ProcurementService],
  exports:     [ProcurementService],
})
export class ProcurementModule {}
