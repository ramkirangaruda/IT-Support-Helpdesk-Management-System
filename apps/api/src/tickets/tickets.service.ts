import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Priority, RoleName, TicketStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEvent } from '../notifications/notification-job.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TICKET_DETAIL_INCLUDE, TicketStateMachineService } from './ticket-state-machine.service';
import { TICKET_COMMENT_ADDED, TicketCommentAddedEvent } from './ticket-events';
import { AddCommentDto } from './dto/add-comment.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { ResolveTicketDto } from './dto/resolve-ticket.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

// Include shape for list responses (compact — no comments or history)
const SUMMARY_INCLUDE = {
  requester: { select: { id: true, name: true, email: true } },
  assignee:  { select: { id: true, name: true, email: true } },
  category:  { select: { id: true, name: true } },
} satisfies Prisma.TicketInclude;

const DETAIL_INCLUDE = TICKET_DETAIL_INCLUDE;

// ── RBAC helpers ─────────────────────────────────────────────────────────────

type Scope = 'all' | 'assigned' | 'own';

// Per RBAC matrix §3.4 the ticket-handling roles are EMPLOYEE / AGENT / IT_ADMIN /
// L2_L3 / SYS_ADMIN. MANAGER and FINANCE are procurement roles and are NOT granted
// ticket visibility — they fall through to 'own' scope (they can still raise tickets).
const ALL_ROLES:      RoleName[] = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];
const ASSIGNED_ROLES: RoleName[] = [RoleName.AGENT, RoleName.L2_L3];

function visibilityScope(user: AuthenticatedUser): Scope {
  const roles = user.roles;
  if (roles.some(r => ALL_ROLES.includes(r)))      return 'all';
  if (roles.some(r => ASSIGNED_ROLES.includes(r))) return 'assigned';
  return 'own';
}

// Map a target TicketStatus to the right notification event
function statusToEvent(status: TicketStatus): NotificationEvent {
  const map: Partial<Record<TicketStatus, NotificationEvent>> = {
    [TicketStatus.ASSIGNED]:  'ticket.assigned',
    [TicketStatus.RESOLVED]:  'ticket.resolved',
    [TicketStatus.CLOSED]:    'ticket.closed',
    [TicketStatus.REOPENED]:  'ticket.reopened',
    [TicketStatus.ESCALATED]: 'ticket.escalated',
  };
  return map[status] ?? 'ticket.status_changed';
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stateMachine: TicketStateMachineService,
    private readonly notifications: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Write-side authorization ────────────────────────────────────────────────
  // Read scoping is handled by visibilityScope; write actions (comment, status
  // change, resolve) must ALSO honour the same scope per §3.4 — agents/L2-L3 may
  // only act on tickets assigned to them, employees only on their own.
  private assertWriteScope(
    ticket: { requesterId: string; assigneeId: string | null },
    actor: AuthenticatedUser,
  ): void {
    const scope = visibilityScope(actor);
    if (scope === 'own' && ticket.requesterId !== actor.id) {
      throw new ForbiddenException('You can only act on your own tickets');
    }
    if (scope === 'assigned' && ticket.assigneeId !== actor.id) {
      throw new ForbiddenException('You can only act on tickets assigned to you');
    }
  }

  // ── ID generation ─────────────────────────────────────────────────────────
  // Uses findFirst+orderBy desc on the INC-YYYY prefix so deleted tickets
  // don't reset the counter. PK uniqueness catches the rare race condition.
  private async generateId(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INC-${year}-`;
    const last = await this.prisma.ticket.findFirst({
      where: { id: { startsWith: prefix } },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const seq = last ? parseInt(last.id.slice(prefix.length), 10) : 0;
    return `${prefix}${String(seq + 1).padStart(6, '0')}`;
  }

  // ── SLA deadlines (wall-clock, Phase 1 — BusinessCalendar wired in Phase 2) ─
  private slaDeadlines(from: Date, responseH: number, resolutionH: number) {
    const ms = (h: number) => h * 3_600_000;
    return {
      slaResponseDue:   new Date(from.getTime() + ms(responseH)),
      slaResolutionDue: new Date(from.getTime() + ms(resolutionH)),
    };
  }

  // ── 1. CREATE ─────────────────────────────────────────────────────────────
  async create(dto: CreateTicketDto, actor: AuthenticatedUser) {
    let id: string;
    let attempts = 0;
    const now = new Date();

    const slaPolicy = await this.prisma.sLAPolicy.findUnique({
      where: { priority: dto.priority },
    });
    const sla = slaPolicy
      ? this.slaDeadlines(now, slaPolicy.responseTargetHours, slaPolicy.resolutionTargetHours)
      : { slaResponseDue: null, slaResolutionDue: null };

    const initialStatus = dto.assigneeId ? TicketStatus.ASSIGNED : TicketStatus.NEW;

    // ID-gen retry: re-generate on P2002 (PK collision under concurrency), up to 3 times
    let ticket: Awaited<ReturnType<typeof this.prisma.ticket.create>>;
    while (true) {
      id = await this.generateId();
      try {
        ticket = await this.prisma.ticket.create({
          data: {
            id,
            subject:     dto.subject,
            description: dto.description,
            priority:    dto.priority,
            source:      dto.source,
            categoryId:  dto.categoryId,
            requesterId: actor.id,
            assigneeId:  dto.assigneeId ?? null,
            status:      initialStatus,
            ...sla,
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus:   initialStatus,
                actorId:    actor.id,
                reason:     'Ticket created',
              },
            },
          },
          include: DETAIL_INCLUDE,
        });
        break;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && ++attempts < 3) {
          continue;
        }
        throw err;
      }
    }

    await this.audit.log({
      actorId:  actor.id,
      entity:   'Ticket',
      entityId: ticket.id,
      action:   'CREATE',
      after:    { id: ticket.id, status: ticket.status, priority: ticket.priority },
    });

    // Notify: requester (confirmation) + IT_ADMINs (new ticket alert).
    // No actorEmail exclusion here — the requester must always receive their own confirmation.
    await this.notifications.emit('ticket.created', ticket.id);

    return ticket;
  }

  // ── 2. FIND ALL ───────────────────────────────────────────────────────────
  async findAll(query: ListTicketsDto, actor: AuthenticatedUser) {
    const { status, priority, page = 1, limit = 20 } = query;

    const where: Prisma.TicketWhereInput = {};
    if (status)   where.status   = status;
    if (priority) where.priority = priority;

    const scope = visibilityScope(actor);
    if (scope === 'own') {
      where.requesterId = actor.id;
    } else if (scope === 'assigned') {
      where.assigneeId = actor.id;
    }
    if (scope === 'all') {
      if (query.requesterId) where.requesterId = query.requesterId;
      if (query.assigneeId)  where.assigneeId  = query.assigneeId;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include:  SUMMARY_INCLUDE,
        orderBy:  { createdAt: 'desc' },
        skip:     (page - 1) * limit,
        take:     limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ── 3. FIND ONE ───────────────────────────────────────────────────────────
  async findOne(id: string, actor: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });

    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);

    const scope = visibilityScope(actor);
    if (scope === 'own'      && ticket.requesterId !== actor.id) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }
    if (scope === 'assigned' && ticket.assigneeId  !== actor.id) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }

    // Employees and other non-agent roles must not see internal notes
    if (scope === 'own') {
      return {
        ...ticket,
        comments: ticket.comments.filter(c => !c.isInternal),
      };
    }

    return ticket;
  }

  // ── 4. ASSIGN ─────────────────────────────────────────────────────────────
  async assign(ticketId: string, dto: AssignTicketDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!existing) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
    if (!assignee) throw new NotFoundException(`User ${dto.assigneeId} not found`);

    // If the ticket is NEW, transition to ASSIGNED.
    // If already in an active state (ESCALATED, IN_PROGRESS, etc.), keep the current status
    // and just swap the assignee — this enables L2/L3 re-assignment without a status reset.
    const isFirstAssignment = existing.status === TicketStatus.NEW;
    if (isFirstAssignment && !this.stateMachine.canTransition(existing.status, TicketStatus.ASSIGNED)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ASSIGNED. Allowed: [${this.stateMachine.allowedFrom(existing.status).join(', ')}]`,
      );
    }

    const newStatus = isFirstAssignment ? TicketStatus.ASSIGNED : existing.status;

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assigneeId: dto.assigneeId,
        status:     newStatus,
        ...(dto.priority   !== undefined && { priority:   dto.priority   as Priority }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        statusHistory: {
          create: {
            fromStatus: existing.status,
            toStatus:   newStatus,
            actorId:    actor.id,
            reason:     `${isFirstAssignment ? 'Assigned' : 'Reassigned'} to ${assignee.name ?? assignee.email}`,
          },
        },
      },
      include: DETAIL_INCLUDE,
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'Ticket',
      entityId: ticketId,
      action:   'ASSIGN',
      before:   { status: existing.status, assigneeId: existing.assigneeId },
      after:    { status: newStatus, assigneeId: dto.assigneeId },
    });

    await this.notifications.emit('ticket.assigned', ticketId, { actorEmail: actor.email });

    return updated;
  }

  // ── 5. ADD COMMENT ────────────────────────────────────────────────────────
  async addComment(ticketId: string, dto: AddCommentDto, actor: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { requester: { select: { email: true, name: true } } },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    this.assertWriteScope(ticket, actor);
    const scope = visibilityScope(actor);

    if (this.stateMachine.isTerminal(ticket.status)) {
      throw new BadRequestException(`Ticket is ${ticket.status} — comments are locked`);
    }

    const isInternal = scope !== 'own' ? (dto.isInternal ?? false) : false;

    const comment = await this.prisma.comment.create({
      data: {
        ticketId,
        authorId:   actor.id,
        body:       dto.body,
        isInternal,
      },
      include: { author: { select: { id: true, name: true, email: true } } },
    });

    // Fire event for non-internal comments — TicketEventsListener calls notifications.emit
    if (!isInternal) {
      const evt = Object.assign(new TicketCommentAddedEvent(), {
        ticketId,
        ticketSubject:  ticket.subject,
        commentBody:    dto.body,
        isInternal:     false,
        authorEmail:    actor.email,
        requesterEmail: ticket.requester.email,
        requesterName:  ticket.requester.name ?? 'User',
      });
      this.eventEmitter.emit(TICKET_COMMENT_ADDED, evt);
    }

    return comment;
  }

  // ── 6. RESOLVE ────────────────────────────────────────────────────────────
  async resolve(ticketId: string, dto: ResolveTicketDto, actor: AuthenticatedUser) {
    if (!dto.resolutionSummary?.trim()) {
      throw new BadRequestException('resolutionSummary must not be empty');
    }

    const existing = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { requesterId: true, assigneeId: true },
    });
    if (!existing) throw new NotFoundException(`Ticket ${ticketId} not found`);
    this.assertWriteScope(existing, actor);

    const updated = await this.stateMachine.transition(
      ticketId,
      TicketStatus.RESOLVED,
      actor.id,
      dto.resolutionSummary.trim(),
    );

    // Notify requester: resolved confirmation + link to reopen
    await this.notifications.emit('ticket.resolved', ticketId, {
      actorName:  actor.email,
      actorEmail: actor.email,
    });

    return updated;
  }

  // ── 7. UPDATE METADATA ────────────────────────────────────────────────────
  async update(id: string, dto: UpdateTicketDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.ticket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Ticket ${id} not found`);

    if (this.stateMachine.isTerminal(existing.status)) {
      throw new BadRequestException(
        `Ticket ${id} is ${existing.status} and cannot be modified`,
      );
    }

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        ...(dto.subject     !== undefined && { subject:     dto.subject }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority    !== undefined && { priority:    dto.priority }),
        ...(dto.categoryId  !== undefined && { category:    { connect: { id: dto.categoryId } } }),
        ...('assigneeId' in dto && {
          assignee: dto.assigneeId
            ? { connect: { id: dto.assigneeId } }
            : { disconnect: true },
        }),
      },
      include: DETAIL_INCLUDE,
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'Ticket',
      entityId: id,
      action:   'UPDATE',
      before:   { subject: existing.subject, priority: existing.priority, assigneeId: existing.assigneeId },
      after:    { subject: updated.subject,  priority: updated.priority,  assigneeId: updated.assigneeId },
    });

    return updated;
  }

  // ── 8. TRANSITION (generic) ───────────────────────────────────────────────
  async transition(id: string, dto: TransitionStatusDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.ticket.findUnique({
      where: { id },
      select: { requesterId: true, assigneeId: true, status: true },
    });
    if (!existing) throw new NotFoundException(`Ticket ${id} not found`);

    const scope = visibilityScope(actor);
    if (scope === 'own') {
      if (existing.requesterId !== actor.id) {
        throw new ForbiddenException('You can only manage your own tickets');
      }
      // §3.4 — employees may cancel, reopen, or confirm resolution of their own tickets.
      const employeeAllowed =
        dto.toStatus === TicketStatus.CANCELLED ||
        dto.toStatus === TicketStatus.REOPENED ||
        (dto.toStatus === TicketStatus.CLOSED && existing.status === TicketStatus.RESOLVED);
      if (!employeeAllowed) {
        throw new ForbiddenException(
          'Employees may only cancel, reopen, or confirm resolution of their own tickets',
        );
      }
    } else if (scope === 'assigned') {
      if (existing.assigneeId !== actor.id) {
        throw new ForbiddenException('You can only manage tickets assigned to you');
      }
      // §3.4 — Reopen is restricted to IT Admin / Sys Admin.
      if (dto.toStatus === TicketStatus.REOPENED) {
        throw new ForbiddenException('Reopening is restricted to IT Admin / Sys Admin');
      }
    }
    // scope === 'all' (IT_ADMIN / SYS_ADMIN) → any valid transition

    const updated = await this.stateMachine.transition(id, dto.toStatus, actor.id, dto.reason);

    // Only send notifications for non-CANCELLED transitions
    if (dto.toStatus !== TicketStatus.CANCELLED) {
      await this.notifications.emit(statusToEvent(dto.toStatus), id, {
        actorName:  actor.email,
        actorEmail: actor.email,
      });
    }

    return updated;
  }

  // ── 9. STATS ──────────────────────────────────────────────────────────────
  async getStats() {
    const now = new Date();
    const openStatuses = [
      TicketStatus.NEW, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS,
      TicketStatus.ON_HOLD, TicketStatus.ESCALATED, TicketStatus.REOPENED,
    ];

    const [totalOpen, newCount, assignedCount, inProgressCount, escalatedCount, breachedCount] =
      await Promise.all([
        this.prisma.ticket.count({ where: { status: { in: openStatuses } } }),
        this.prisma.ticket.count({ where: { status: TicketStatus.NEW } }),
        this.prisma.ticket.count({ where: { status: TicketStatus.ASSIGNED } }),
        this.prisma.ticket.count({ where: { status: TicketStatus.IN_PROGRESS } }),
        this.prisma.ticket.count({ where: { status: TicketStatus.ESCALATED } }),
        this.prisma.ticket.count({
          where: {
            slaResolutionDue: { lt: now },
            status: { in: openStatuses },
          },
        }),
      ]);

    return {
      totalOpen,
      new: newCount,
      assigned: assignedCount,
      inProgress: inProgressCount,
      escalated: escalatedCount,
      breachedSla: breachedCount,
    };
  }
}
