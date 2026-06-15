import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { RoleName, UserStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEVICE_QUEUE_NAME, DeviceJobType } from './device-reminder.constants';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

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

      await this.sendReminderEmail(employee, holdCount, nextCycle, cc);
      reminded++;

      this.logger.log(
        `Reminder cycle=${nextCycle} sent → ${employee.email} (holds ${holdCount} / max ${maxDevices}) CC=[${cc.join(', ')}]`,
      );
    }

    this.logger.log(`CHECK_DEVICE_LIMITS: ${reminded} reminder(s) sent, ${resolved} resolved`);
  }

  private async sendReminderEmail(
    employee:  { id: string; name: string; email: string },
    holdCount: number,
    cycle:     number,
    cc:        string[],
  ): Promise<void> {
    const subject = `[TicketZilla] Please return a device — you currently hold ${holdCount}`;
    const portalUrl = `${FRONTEND_URL}/tickets`;

    let bodyHtml: string;
    let bodyText: string;

    if (cycle === 1) {
      // ── Polite nudge ────────────────────────────────────────────────────────
      bodyHtml = `
        <p>Hi ${employee.name},</p>
        <p>Our records show you currently have <strong>${holdCount} device(s)</strong> checked out.
           Our standard policy allows a maximum of <strong>2 devices</strong> per employee.</p>
        <p>When you have a moment, please return any devices you no longer need by raising a ticket
           through the IT Help Desk portal.</p>
        <p>If you believe this is in error, please contact the IT team.</p>`;
      bodyText = `Hi ${employee.name},\n\nOur records show you currently hold ${holdCount} device(s). The maximum is 2 per employee.\n\nPlease return any devices you no longer need via the IT Help Desk portal.\n\nIf you believe this is in error, please contact the IT team.`;
    } else if (cycle === 2) {
      // ── Firmer reminder ─────────────────────────────────────────────────────
      bodyHtml = `
        <p>Hi ${employee.name},</p>
        <p>This is a follow-up to our previous reminder. You still have
           <strong>${holdCount} device(s)</strong> checked out, which exceeds the limit of
           <strong>2 devices</strong> per employee per the
           <strong>IT Asset Management Policy (Section 6.2)</strong>.</p>
        <p>Please arrange to return the excess device(s) at your earliest convenience.
           You can do so by raising a request through the IT Help Desk portal, or by
           contacting the IT team directly.</p>
        <p>Continued non-compliance may result in escalation to your manager.</p>`;
      bodyText = `Hi ${employee.name},\n\nThis is a follow-up reminder. You still hold ${holdCount} device(s), exceeding the limit of 2 per the IT Asset Management Policy (Section 6.2).\n\nPlease arrange to return the excess device(s) via the IT Help Desk portal.\n\nContinued non-compliance may result in escalation to your manager.`;
    } else {
      // ── Escalation (cycle 3+) ────────────────────────────────────────────
      bodyHtml = `
        <p>Hi ${employee.name},</p>
        <p>Despite previous reminders, you still have <strong>${holdCount} device(s)</strong>
           checked out, exceeding the allowable limit of <strong>2 devices</strong> per employee.
           This is reminder <strong>#${cycle}</strong>.</p>
        <p>This matter has been escalated to your manager and the IT Administration team.
           Please return the excess device(s) <strong>immediately</strong> or contact IT to
           discuss extenuating circumstances.</p>
        <p>Failure to act may result in formal proceedings under the
           IT Asset Management Policy.</p>`;
      bodyText = `Hi ${employee.name},\n\nDespite previous reminders, you still hold ${holdCount} device(s) (limit: 2). This is reminder #${cycle}.\n\nThis matter has been escalated to your manager and IT Admin. Please return the excess device(s) immediately or contact IT.`;
    }

    const accentColor = cycle === 1 ? '#0369a1' : cycle === 2 ? '#d97706' : '#dc2626';
    const title = cycle === 1
      ? 'Device Return Reminder'
      : cycle === 2
      ? 'Device Return Reminder — Action Required'
      : `Device Return Reminder — Escalation (Notice #${cycle})`;

    const html = `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;
            border:1px solid #e5e7eb;border-radius:8px;border-top:4px solid ${accentColor}">
  <h2 style="color:${accentColor};margin-top:0">${title}</h2>
  ${bodyHtml}
  <p><a href="${portalUrl}"
    style="display:inline-block;padding:10px 20px;background:#1d4ed8;
           color:#fff;border-radius:6px;text-decoration:none;font-weight:600"
  >Open IT Help Desk Portal</a></p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:24px"/>
  <p style="color:#6b7280;font-size:12px">TicketZilla IT Help Desk — automated device management notification</p>
</div>`;

    await this.notifications.sendAdHoc(
      employee.email,
      employee.name,
      `device.reminder.cycle${cycle}`,
      subject,
      html,
      bodyText,
      cc,
    );
  }
}
