import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, RoleName, TicketStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
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

const ALL_ROLES:      RoleName[] = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN, RoleName.MANAGER, RoleName.FINANCE];
const ASSIGNED_ROLES: RoleName[] = [RoleName.AGENT, RoleName.L2_L3];

function visibilityScope(user: AuthenticatedUser): Scope {
  const roles = user.roles;
  if (roles.some(r => ALL_ROLES.includes(r)))      return 'all';
  if (roles.some(r => ASSIGNED_ROLES.includes(r))) return 'assigned';
  return 'own';
}

function isAgentOrAbove(user: AuthenticatedUser): boolean {
  return visibilityScope(user) !== 'own';
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
    const id  = await this.generateId();
    const now = new Date();

    const slaPolicy = await this.prisma.sLAPolicy.findUnique({
      where: { priority: dto.priority },
    });
    const sla = slaPolicy
      ? this.slaDeadlines(now, slaPolicy.responseTargetHours, slaPolicy.resolutionTargetHours)
      : { slaResponseDue: null, slaResolutionDue: null };

    const initialStatus = dto.assigneeId ? TicketStatus.ASSIGNED : TicketStatus.NEW;

    const ticket = await this.prisma.ticket.create({
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

    await this.audit.log({
      actorId:  actor.id,
      entity:   'Ticket',
      entityId: ticket.id,
      action:   'CREATE',
      after:    { id: ticket.id, status: ticket.status, priority: ticket.priority },
    });

    await this.notifications.enqueue({
      event:          'ticket.created',
      ticketId:       ticket.id,
      ticketSubject:  ticket.subject,
      requesterEmail: (ticket.requester as { email: string }).email,
      requesterName:  (ticket.requester as { name: string }).name ?? 'User',
      assigneeEmail:  ticket.assignee ? (ticket.assignee as { email: string }).email : null,
      assigneeName:   ticket.assignee ? (ticket.assignee as { name: string }).name  : null,
    });

    return ticket;
  }

  // ── 2. FIND ALL ───────────────────────────────────────────────────────────
  // Visibility per RBAC matrix:
  //   EMPLOYEE           → own raised tickets
  //   AGENT / L2_L3      → assigned tickets
  //   IT_ADMIN / SYS_ADMIN / MANAGER / FINANCE → all tickets
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
    // scope === 'all': honour optional filter params from query
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

    return ticket;
  }

  // ── 4. ASSIGN ─────────────────────────────────────────────────────────────
  // Atomically sets the assignee and transitions status to ASSIGNED.
  async assign(ticketId: string, dto: AssignTicketDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!existing) throw new NotFoundException(`Ticket ${ticketId} not found`);

    if (!this.stateMachine.canTransition(existing.status, TicketStatus.ASSIGNED)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ASSIGNED. Allowed: [${this.stateMachine.allowedFrom(existing.status).join(', ')}]`,
      );
    }

    const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
    if (!assignee) throw new NotFoundException(`User ${dto.assigneeId} not found`);

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assigneeId: dto.assigneeId,
        status:     TicketStatus.ASSIGNED,
        statusHistory: {
          create: {
            fromStatus: existing.status,
            toStatus:   TicketStatus.ASSIGNED,
            actorId:    actor.id,
            reason:     `Assigned to ${assignee.name ?? assignee.email}`,
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
      after:    { status: TicketStatus.ASSIGNED, assigneeId: dto.assigneeId },
    });

    await this.notifications.enqueue({
      event:          'ticket.assigned',
      ticketId:       updated.id,
      ticketSubject:  updated.subject,
      requesterEmail: (updated.requester as { email: string }).email,
      requesterName:  (updated.requester as { name: string }).name ?? 'User',
      assigneeEmail:  (updated.assignee as { email: string }).email,
      assigneeName:   (updated.assignee as { name: string }).name ?? null,
    });

    return updated;
  }

  // ── 5. ADD COMMENT ────────────────────────────────────────────────────────
  // Uses EventEmitter (not BullMQ) — lightweight notification path for comments.
  async addComment(ticketId: string, dto: AddCommentDto, actor: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { requester: { select: { email: true, name: true } } },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const scope = visibilityScope(actor);
    if (scope === 'own' && ticket.requesterId !== actor.id) {
      throw new ForbiddenException('You can only comment on your own tickets');
    }

    if (this.stateMachine.isTerminal(ticket.status)) {
      throw new BadRequestException(`Ticket is ${ticket.status} — comments are locked`);
    }

    // Employees cannot post internal notes
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
    // Delegates to state machine: validates transition, updates status,
    // creates StatusHistory (reason = resolutionSummary), writes AuditLog.
    return this.stateMachine.transition(
      ticketId,
      TicketStatus.RESOLVED,
      actor.id,
      dto.resolutionSummary.trim(),
    );
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
    // Employees can only cancel their own tickets
    if (!isAgentOrAbove(actor)) {
      const existing = await this.prisma.ticket.findUnique({
        where: { id },
        select: { requesterId: true },
      });
      if (!existing) throw new NotFoundException(`Ticket ${id} not found`);
      if (existing.requesterId !== actor.id) {
        throw new ForbiddenException('You can only manage your own tickets');
      }
      if (dto.toStatus !== TicketStatus.CANCELLED) {
        throw new ForbiddenException('Employees may only cancel tickets');
      }
    }

    const updated = await this.stateMachine.transition(id, dto.toStatus, actor.id, dto.reason);

    const notifEvent = dto.toStatus === TicketStatus.ASSIGNED
      ? 'ticket.assigned'
      : 'ticket.status_changed';

    await this.notifications.enqueue({
      event:          notifEvent,
      ticketId:       updated.id,
      ticketSubject:  updated.subject,
      ticketStatus:   dto.toStatus,
      actorName:      actor.email,
      requesterEmail: (updated.requester as { email: string }).email,
      requesterName:  (updated.requester as { name: string }).name ?? 'User',
      assigneeEmail:  updated.assignee ? (updated.assignee as { email: string }).email : null,
      assigneeName:   updated.assignee ? (updated.assignee as { name: string }).name  : null,
    });

    return updated;
  }
}
