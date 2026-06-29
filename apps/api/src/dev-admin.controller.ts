import { Controller, ForbiddenException, Get, Post, Query } from '@nestjs/common';
import { NotificationStatus, RoleName } from '@prisma/client';
import { Roles } from './auth/decorators/roles.decorator';
import { Public } from './auth/decorators/public.decorator';
import { DeviceReminderProcessor } from './devices/device-reminder.processor';
import { NotificationsService } from './notifications/notifications.service';
import { SlaProcessor } from './sla/sla.processor';

@Controller('admin')
export class DevAdminController {
  constructor(
    private readonly slaProcessor:         SlaProcessor,
    private readonly deviceProcessor:      DeviceReminderProcessor,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post('trigger-escalation-check')
  @Public()
  async triggerEscalationCheck() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev-only endpoint');
    }
    await this.slaProcessor.checkEscalations();
    return { ok: true, message: 'Escalation check complete — see server logs for details' };
  }

  @Post('trigger-device-reminder-check')
  @Public()
  async triggerDeviceReminderCheck() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev-only endpoint');
    }
    await this.deviceProcessor.checkDeviceLimits();
    return { ok: true, message: 'Device limit check complete — see server logs for details' };
  }

  @Post('trigger-sla-warning-check')
  @Public()
  async triggerSlaWarningCheck() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev-only endpoint');
    }
    await this.slaProcessor.checkSlaWarnings();
    return { ok: true, message: 'SLA warning check complete — see server logs for details' };
  }

  /**
   * GET /api/admin/notifications?status=SENT&limit=100
   * Returns notifications filtered by status. Default status = SENT.
   * Restricted to IT_ADMIN and SYS_ADMIN in all environments.
   */
  @Get('notifications')
  @Roles(RoleName.IT_ADMIN, RoleName.SYS_ADMIN)
  listNotifications(
    @Query('status') status?: string,
    @Query('limit')  limit?:  string,
  ) {
    const ns  = (status?.toUpperCase() as NotificationStatus | undefined) ?? NotificationStatus.SENT;
    const lim = limit ? parseInt(limit, 10) : 100;
    return this.notificationsService.listByStatus(ns, lim);
  }
}
