import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName, TicketStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TICKET_DETAIL_INCLUDE, TicketStateMachineService } from './ticket-state-machine.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';

// Roles that can view all tickets and manage them
const AGENT_ROLES: RoleName[] = [
  RoleName.AGENT,
  RoleName.IT_ADMIN,
  RoleName.L2_L3,
  RoleName.MANAGER,
  RoleName.SYS_ADMIN,
  RoleName.FINANCE,
];

function isAgent(user: AuthenticatedUser): boolean {
  return user.roles.some((r) => AGENT_ROLES.includes(r));
}

// Include shape for list responses (no comments/history to keep payloads small)
const SUMMARY_INCLUDE = {
  requester: { select: { id: true, name: true, email: true } },
  assignee:  { select: { id: true, name: true, email: true } },
  category:  { select: { id: true, name: true } },
} satisfies Prisma.TicketInclude;

// Include shape for single-ticket detail (canonical definition is in ticket-state-machine.service)
const DETAIL_INCLUDE = TICKET_DETAIL_INCLUDE;

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stateMachine: TicketStateMachineService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── INC-YYYY-NNNNNN generation ────────────────────────────────────────────
  // Finds the highest existing sequence for the current year and increments.
  // The unique PK constraint on Ticket.id is the safety net for race conditions.
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

  // ── SLA due dates (Phase 1: wall-clock hours; TODO: apply BusinessCalendar) ─
  private slaDeadlines(
    from: Date,
    responseH: number,
    resolutionH: number,
  ): { slaResponseDue: Date; slaResolutionDue: Date } {
    const ms = (h: number) => h * 3_600_000;
    return {
      slaResponseDue:   new Date(from.getTime() + ms(responseH)),
      slaResolutionDue: new Date(from.getTime() + ms(resolutionH)),
    };
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  async create(dto: CreateTicketDto, actor: AuthenticatedUser) {
    const id = await this.generateId();
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

  // ── LIST ──────────────────────────────────────────────────────────────────
  async findAll(query: ListTicketsDto, actor: AuthenticatedUser) {
    const { status, priority, assigneeId, requesterId, page = 1, limit = 20 } = query;

    const where: Prisma.TicketWhereInput = {};
    if (status)     where.status   = status;
    if (priority)   where.priority = priority;
    if (assigneeId) where.assigneeId = assigneeId;

    if (!isAgent(actor)) {
      // Employees only see their own tickets
      where.requesterId = actor.id;
    } else if (requesterId) {
      where.requesterId = requesterId;
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

  // ── GET ONE ───────────────────────────────────────────────────────────────
  async findOne(id: string, actor: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });

    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);

    if (!isAgent(actor) && ticket.requesterId !== actor.id) {
      throw new ForbiddenException('You can only view your own tickets');
    }

    return ticket;
  }

  // ── UPDATE METADATA ───────────────────────────────────────────────────────
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

  // ── STATUS TRANSITION ─────────────────────────────────────────────────────
  async transition(id: string, dto: TransitionStatusDto, actor: AuthenticatedUser) {
    // RBAC: employees can only cancel their own tickets
    if (!isAgent(actor)) {
      const existing = await this.prisma.ticket.findUnique({ where: { id }, select: { requesterId: true } });
      if (!existing) throw new NotFoundException(`Ticket ${id} not found`);
      if (existing.requesterId !== actor.id) {
        throw new ForbiddenException('You can only manage your own tickets');
      }
      if (dto.toStatus !== TicketStatus.CANCELLED) {
        throw new ForbiddenException('Employees may only cancel tickets');
      }
    }

    // Delegate state validation, DB write, status history, and audit to the state machine
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
