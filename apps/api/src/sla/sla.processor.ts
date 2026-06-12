import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { TicketStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStateMachineService } from '../tickets/ticket-state-machine.service';
import { SLA_QUEUE_NAME, SlaJobType } from './sla.constants';

// States where SLA is still ticking
const ACTIVE_STATUSES: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.ASSIGNED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.ON_HOLD,
  TicketStatus.ESCALATED,
  TicketStatus.REOPENED,
];

// States that can be transitioned to ESCALATED (excludes NEW per state machine)
const ESCALATABLE_STATUSES: TicketStatus[] = [
  TicketStatus.ASSIGNED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.ON_HOLD,
  TicketStatus.REOPENED,
];

@Processor(SLA_QUEUE_NAME)
@Injectable()
export class SlaProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: TicketStateMachineService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name as SlaJobType) {
      case SlaJobType.CHECK_SLA_WARNINGS:
        await this.checkSlaWarnings();
        break;
      case SlaJobType.CHECK_ESCALATIONS:
        await this.checkEscalations();
        break;
      default:
        this.logger.warn(`Unknown SLA job: ${job.name}`);
    }
  }

  // ── CHECK_SLA_WARNINGS ────────────────────────────────────────────────────
  // Idempotent: query filters sla75WarningSent=false; atomic updateMany guards
  // against double-processing if the job fires twice in the same window.
  private async checkSlaWarnings(): Promise<void> {
    const now = new Date();

    const tickets = await this.prisma.ticket.findMany({
      where: {
        status:           { in: ACTIVE_STATUSES },
        slaResolutionDue: { not: null },
        sla75WarningSent: false,
      },
    });

    this.logger.log(`CHECK_SLA_WARNINGS: evaluating ${tickets.length} active tickets`);
    let warned = 0;

    for (const ticket of tickets) {
      if (!ticket.slaResolutionDue) continue;

      // Effective remaining = wall-clock remaining + accumulated pause time
      const wallRemaining    = ticket.slaResolutionDue.getTime() - now.getTime();
      const effectiveRemaining = wallRemaining + ticket.slaPausedMs;

      // Total SLA time = resolution deadline - ticket creation (wall-clock basis)
      const totalSlaMs    = ticket.slaResolutionDue.getTime() - ticket.createdAt.getTime();
      const threshold25pct = totalSlaMs * 0.25;

      if (effectiveRemaining > threshold25pct) continue; // plenty of time left

      // Atomic set: if another worker already flipped the flag this returns count=0
      const { count } = await this.prisma.ticket.updateMany({
        where: { id: ticket.id, sla75WarningSent: false },
        data:  { sla75WarningSent: true },
      });
      if (count === 0) continue; // race-condition guard: already warned

      const remainingMinutes = Math.max(0, Math.round(effectiveRemaining / 60_000));
      this.logger.log(
        `SLA 75% warning: ${ticket.id} — ${remainingMinutes}min remaining (threshold ${Math.round(threshold25pct / 60_000)}min)`,
      );
      warned++;

      await this.notifications.emit('ticket.sla_warning', ticket.id, {
        slaRemainingMinutes: remainingMinutes,
      });
    }

    this.logger.log(`CHECK_SLA_WARNINGS: sent ${warned} warnings`);
  }

  // ── CHECK_ESCALATIONS ─────────────────────────────────────────────────────
  // Idempotent: ESCALATED status is excluded from the query so already-escalated
  // tickets are never processed again. try/catch on stateMachine.transition handles
  // rare race conditions where two workers reach the same ticket simultaneously.
  private async checkEscalations(): Promise<void> {
    const now = new Date();

    const tickets = await this.prisma.ticket.findMany({
      where: {
        status:           { in: ESCALATABLE_STATUSES },
        slaResolutionDue: { lt: now },
      },
    });

    this.logger.log(`CHECK_ESCALATIONS: evaluating ${tickets.length} potentially breached tickets`);
    let escalated = 0;

    for (const ticket of tickets) {
      if (!ticket.slaResolutionDue) continue;

      // Precise breach check accounting for time paused on-hold
      const effectiveRemaining =
        ticket.slaResolutionDue.getTime() + ticket.slaPausedMs - now.getTime();
      if (effectiveRemaining > 0) continue; // still within adjusted window

      try {
        // State machine validates the transition and writes history + audit
        await this.stateMachine.transition(
          ticket.id,
          TicketStatus.ESCALATED,
          null,
          'SLA breach: auto-escalated by system',
        );

        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data:  { escalationLevel: { increment: 1 } },
        });

        escalated++;
        this.logger.warn(`Escalated ${ticket.id} — SLA breach (${Math.round(-effectiveRemaining / 60_000)}min overdue)`);

        await this.notifications.emit('ticket.escalated', ticket.id);
      } catch (err) {
        if (err instanceof BadRequestException) {
          // Already escalated by a concurrent worker — harmless
          this.logger.debug(`${ticket.id} already escalated (race-condition guard)`);
        } else {
          this.logger.error(`Escalation failed for ${ticket.id}: ${(err as Error).message}`);
        }
      }
    }

    this.logger.log(`CHECK_ESCALATIONS: escalated ${escalated} tickets`);
  }
}
