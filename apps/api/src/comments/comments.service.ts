import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStateMachineService } from '../tickets/ticket-state-machine.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

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

const AUTHOR_SELECT = { select: { id: true, name: true, email: true } };

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stateMachine: TicketStateMachineService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(ticketId: string, dto: CreateCommentDto, actor: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    if (!isAgent(actor) && ticket.requesterId !== actor.id) {
      throw new ForbiddenException('You can only comment on your own tickets');
    }

    if (this.stateMachine.isTerminal(ticket.status)) {
      throw new BadRequestException(`Ticket is ${ticket.status} and cannot be commented on`);
    }

    // Only agents can post internal notes
    const internal = isAgent(actor) ? (dto.isInternal ?? false) : false;

    const comment = await this.prisma.comment.create({
      data: {
        ticketId,
        authorId: actor.id,
        body: dto.body,
        isInternal: internal,
      },
      include: { author: AUTHOR_SELECT },
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'Comment',
      entityId: comment.id,
      action:   'CREATE',
      after:    { ticketId, isInternal: internal },
    });

    // Only notify the requester if it's a public comment from an agent
    if (!internal && isAgent(actor) && ticket.requesterId !== actor.id) {
      const fullTicket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { requester: { select: { email: true, name: true } } },
      });
      if (fullTicket) {
        await this.notifications.enqueue({
          event:          'ticket.comment_added',
          ticketId,
          ticketSubject:  fullTicket.subject,
          commentBody:    dto.body,
          requesterEmail: fullTicket.requester.email,
          requesterName:  fullTicket.requester.name ?? 'User',
        });
      }
    }

    return comment;
  }

  async findAll(ticketId: string, actor: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    if (!isAgent(actor) && ticket.requesterId !== actor.id) {
      throw new ForbiddenException('You can only view comments on your own tickets');
    }

    // Employees don't see internal notes
    const where = isAgent(actor)
      ? { ticketId }
      : { ticketId, isInternal: false };

    return this.prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { author: AUTHOR_SELECT },
    });
  }

  async update(ticketId: string, commentId: string, dto: UpdateCommentDto, actor: AuthenticatedUser) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.ticketId !== ticketId) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    // Only the author or an IT_ADMIN/SYS_ADMIN can edit
    const adminRoles: RoleName[] = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];
    const canEdit =
      comment.authorId === actor.id ||
      actor.roles.some((r) => adminRoles.includes(r));
    if (!canEdit) throw new ForbiddenException('You cannot edit this comment');

    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body: dto.body },
      include: { author: AUTHOR_SELECT },
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'Comment',
      entityId: commentId,
      action:   'UPDATE',
      before:   { body: comment.body },
      after:    { body: dto.body },
    });

    return updated;
  }

  async remove(ticketId: string, commentId: string, actor: AuthenticatedUser) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.ticketId !== ticketId) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    const adminRoles: RoleName[] = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];
    const canDelete =
      comment.authorId === actor.id ||
      actor.roles.some((r) => adminRoles.includes(r));
    if (!canDelete) throw new ForbiddenException('You cannot delete this comment');

    await this.prisma.comment.delete({ where: { id: commentId } });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'Comment',
      entityId: commentId,
      action:   'DELETE',
      before:   { ticketId, body: comment.body },
    });
  }
}
