import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

// ── Section 4.4 — exact allowed transition table ──────────────────────────────
const ALLOWED: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.NEW]:         [TicketStatus.ASSIGNED, TicketStatus.CANCELLED],
  [TicketStatus.ASSIGNED]:    [TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, TicketStatus.ESCALATED, TicketStatus.CANCELLED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.ON_HOLD, TicketStatus.RESOLVED, TicketStatus.ESCALATED, TicketStatus.CANCELLED],
  [TicketStatus.ON_HOLD]:     [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.ESCALATED, TicketStatus.CANCELLED],
  [TicketStatus.ESCALATED]:   [TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, TicketStatus.RESOLVED],
  [TicketStatus.RESOLVED]:    [TicketStatus.CLOSED, TicketStatus.REOPENED],
  [TicketStatus.REOPENED]:    [TicketStatus.IN_PROGRESS, TicketStatus.ASSIGNED, TicketStatus.ESCALATED],
  [TicketStatus.CLOSED]:      [TicketStatus.REOPENED],
  [TicketStatus.CANCELLED]:   [],
};

// Shared include shape used by both this service and TicketsService
export const TICKET_DETAIL_INCLUDE = {
  requester: { select: { id: true, name: true, email: true } },
  assignee:  { select: { id: true, name: true, email: true } },
  category:  { select: { id: true, name: true } },
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: { id: true, name: true, email: true } } },
  },
  attachments: { orderBy: { createdAt: 'asc' as const } },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    include: { actor: { select: { id: true, name: true, email: true } } },
  },
} satisfies Prisma.TicketInclude;

@Injectable()
export class TicketStateMachineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Pure helpers ─────────────────────────────────────────────────────────────

  canTransition(from: TicketStatus, to: TicketStatus): boolean {
    return ALLOWED[from].includes(to);
  }

  assertTransition(from: TicketStatus, to: TicketStatus): void {
    if (!this.canTransition(from, to)) {
      const allowed = ALLOWED[from];
      throw new BadRequestException(
        `Invalid transition: ${from} → ${to}. Allowed: [${allowed.join(', ') || 'none — terminal state'}]`,
      );
    }
  }

  allowedFrom(status: TicketStatus): TicketStatus[] {
    return ALLOWED[status];
  }

  /** §4.4 reopen window: reject Closed → Reopened past REOPEN_WINDOW_DAYS (default 7). */
  private async assertWithinReopenWindow(closedAt: Date | null): Promise<void> {
    if (!closedAt) return; // no close timestamp recorded — allow
    const cfg = await this.prisma.systemConfig.findUnique({
      where: { key: 'REOPEN_WINDOW_DAYS' },
    });
    const days = cfg ? parseInt(cfg.value, 10) : 7;
    const deadline = closedAt.getTime() + days * 24 * 60 * 60 * 1000;
    if (Date.now() > deadline) {
      throw new BadRequestException(
        `Reopen window of ${days} day(s) has expired (ticket closed ${closedAt.toISOString()})`,
      );
    }
  }

  /**
   * Returns true for states where metadata edits and new comments are blocked.
   * CLOSED can still be re-opened via transition, but data entry is locked.
   */
  isTerminal(status: TicketStatus): boolean {
    return status === TicketStatus.CANCELLED || status === TicketStatus.CLOSED;
  }

  // ── DB-aware transition ───────────────────────────────────────────────────────

  async transition(
    ticketId: string,
    toStatus: TicketStatus,
    actorId: string | null,
    reason?: string,
  ) {
    const existing = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!existing) throw new NotFoundException(`Ticket ${ticketId} not found`);

    if (!this.canTransition(existing.status, toStatus)) {
      const allowed = ALLOWED[existing.status];
      throw new BadRequestException(
        `Invalid transition: ${existing.status} → ${toStatus}. Allowed: [${allowed.join(', ') || 'none — terminal state'}]`,
      );
    }

    // §4.4 — Closed → Reopened is permitted only within the configurable reopen window.
    if (existing.status === TicketStatus.CLOSED && toStatus === TicketStatus.REOPENED) {
      await this.assertWithinReopenWindow(existing.closedAt);
    }

    const now = new Date();

    // Build the update payload incrementally so types stay clean
    const data: Prisma.TicketUpdateInput = { status: toStatus };

    // Entering ON_HOLD: record when the pause started
    if (toStatus === TicketStatus.ON_HOLD) {
      data.pausedAt = now;
    }

    // Leaving ON_HOLD: accumulate elapsed pause duration and clear the marker
    if (existing.status === TicketStatus.ON_HOLD && existing.pausedAt) {
      const elapsedMs = now.getTime() - existing.pausedAt.getTime();
      data.slaPausedMs = { increment: elapsedMs };
      data.pausedAt = null;
    }

    if (toStatus === TicketStatus.RESOLVED) data.resolvedAt = now;
    if (toStatus === TicketStatus.CLOSED)   data.closedAt   = now;

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...data,
        statusHistory: {
          create: {
            fromStatus: existing.status,
            toStatus,
            actorId,
            reason: reason ?? null,
          },
        },
      },
      include: TICKET_DETAIL_INCLUDE,
    });

    await this.audit.log({
      actorId,
      entity:   'Ticket',
      entityId: ticketId,
      action:   'TRANSITION',
      before:   { status: existing.status },
      after:    { status: toStatus },
    });

    return updated;
  }
}
