import { Controller, ForbiddenException, Post } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';
import { DeviceReminderProcessor } from './devices/device-reminder.processor';
import { SlaProcessor } from './sla/sla.processor';

@Controller('admin')
export class DevAdminController {
  constructor(
    private readonly slaProcessor:    SlaProcessor,
    private readonly deviceProcessor: DeviceReminderProcessor,
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
}
