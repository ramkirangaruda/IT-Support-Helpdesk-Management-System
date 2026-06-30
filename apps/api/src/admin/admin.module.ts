import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUserMgmtController } from './admin-user-mgmt.controller';
import { AdminUsersService } from './admin-users.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [AdminUsersController, AdminUserMgmtController],
  providers: [AdminUsersService],
})
export class AdminModule {}
