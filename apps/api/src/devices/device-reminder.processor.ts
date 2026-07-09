import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { RoleName, UserStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEVICE_QUEUE_NAME, DeviceJobType } from './device-reminder.constants';

@Processor(DEVICE_QUEUE_NAME)
@Injectable()
export class DeviceReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(DeviceReminderProcessor.name);

  constructor(
    private readonly prisma:        PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== DeviceJobType.CHECK_DEVICE_LIMITS) {
      this.logger.warn(`Unknown device job: ${job.name}`);
      return;
    }
    await this.checkDeviceLimits();
  }

  async checkDeviceLimits(): Promise<void> {
    // Load config with safe fallbacks
    const [maxCfg, cadenceCfg] = await Promise.all([
      this.prisma.systemConfig.findUnique({ where: { key: 'MAX_DEVICES_PER_EMPLOYEE' } }),
      this.prisma.systemConfig.findUnique({ where: { key: 'REMINDER_CADENCE_DAYS' } }),
    ]);
    const maxDevices  = maxCfg    ? parseInt(maxCfg.value,    10) : 2;
    const cadenceDays = cadenceCfg ? parseInt(cadenceCfg.value, 10) : 3;

    this.logger.log(`CHECK_DEVICE_LIMITS: maxDevices=${maxDevices}, cadence=${cadenceDays}d`);

    // All active employees
    const employees = await this.prisma.user.findMany({
      where: {
        status:    UserStatus.ACTIVE,
        userRoles: { some: { role: { name: RoleName.EMPLOYEE } } },
      },
      select: { id: true, name: true, email: true },
    });

    this.logger.log(`CHECK_DEVICE_LIMITS: evaluating ${employees.length} employees`);

    // IT_ADMIN emails (for CC on every reminder)
    const admins = await this.prisma.user.findMany({
      where: {
        status:    UserStatus.ACTIVE,
        userRoles: { some: { role: { name: RoleName.IT_ADMIN } } },
      },
      select: { email: true },
    });
    const adminEmails = admins.map(a => a.email);

    // MANAGER emails (for CC on cycle 3+)
    const managers = await this.prisma.user.findMany({
      where: {
        status:    UserStatus.ACTIVE,
        userRoles: { some: { role: { name: RoleName.MANAGER } } },
      },
      select: { email: true },
    });
    const managerEmails = managers.map(m => m.email);

    const cadenceCutoff = new Date(Date.now() - cadenceDays * 24 * 60 * 60_000);
    let reminded = 0;
    let resolved  = 0;

    for (const employee of employees) {
      const holdCount = await this.prisma.deviceAllocation.count({
        where: { employeeId: employee.id, returnedOn: null },
      });

      // Under or at limit — resolve any outstanding reminders
      if (holdCount <= maxDevices) {
        const { count } = await this.prisma.deviceReminder.updateMany({
          where: { employeeId: employee.id, resolved: false },
          data:  { resolved: true },
        });
        if (count > 0) {
          resolved += count;
          this.logger.log(`Resolved ${count} reminder(s) for ${employee.email} (now holds ${holdCount})`);
        }
        continue;
      }

      // Over limit — check cadence
      const lastReminder = await this.prisma.deviceReminder.findFirst({
        where:   { employeeId: employee.id },
        orderBy: { sentAt: 'desc' },
      });

      if (lastReminder && lastReminder.sentAt > cadenceCutoff) {
        this.logger.debug(
          `Skipping ${employee.email}: already reminded on ${lastReminder.sentAt.toISOString()} (cycle ${lastReminder.cycle})`,
        );
        continue;
      }

      const nextCycle = (lastReminder?.cycle ?? 0) + 1;

      // Persist reminder record before sending (idempotency: if send fails, record exists)
      await this.prisma.deviceReminder.create({
        data: { employeeId: employee.id, cycle: nextCycle },
      });

      const cc = nextCycle >= 3
        ? [...adminEmails, ...managerEmails].filter(e => e !== employee.email)
        : adminEmails.filter(e => e !== employee.email);

      await this.sendReminderNotification(employee, nextCycle, cc, holdCount, maxDevices);
      reminded++;

      this.logger.log(
        `Reminder cycle=${nextCycle} sent → ${employee.email} (holds ${holdCount} / max ${maxDevices}) CC=[${cc.join(', ')}]`,
      );
    }

    this.logger.log(`CHECK_DEVICE_LIMITS: ${reminded} reminder(s) sent, ${resolved} resolved`);
  }

  private async sendReminderNotification(
    employee:   { id: string; name: string; email: string },
    cycle:      number,
    cc:         string[],
    holdCount:  number,
    maxDevices: number,
  ): Promise<void> {
    await this.notifications.sendAdHoc(employee.email, `device.reminder.cycle${cycle}`, {
      toName:       employee.name,
      deviceCount:  String(holdCount),
      maxDevices:   String(maxDevices),
      reminderCycle: String(cycle),
    });
    // CC recipients (admins, managers on cycle 3+)
    for (const email of cc) {
      await this.notifications.sendAdHoc(email, `device.reminder.escalation_cycle${cycle}`, {
        toName:       employee.name,
        deviceCount:  String(holdCount),
        maxDevices:   String(maxDevices),
        reminderCycle: String(cycle),
      });
    }
  }
}
