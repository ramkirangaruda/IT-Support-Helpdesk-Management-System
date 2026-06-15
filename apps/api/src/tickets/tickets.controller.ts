import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { AddCommentDto } from './dto/add-comment.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { ResolveTicketDto } from './dto/resolve-ticket.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // ── POST /tickets ─────────────────────────────────────────────────────────
  // Any authenticated user can raise a ticket (EMPLOYEE+)
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.create(dto, user);
  }

  // ── GET /tickets ──────────────────────────────────────────────────────────
  // Scoped per RBAC: EMPLOYEE=own, AGENT/L2_L3=assigned, IT_ADMIN/SYS_ADMIN=all
  @Get()
  findAll(
    @Query() query: ListTicketsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.findAll(query, user);
  }

  // ── GET /tickets/stats ───────────────────────────────────────────────────
  // Must be declared before :id to prevent NestJS matching 'stats' as an id
  @Get('stats')
  @Roles(RoleName.IT_ADMIN, RoleName.SYS_ADMIN, RoleName.MANAGER)
  getStats() {
    return this.ticketsService.getStats();
  }

  // ── GET /tickets/:id ──────────────────────────────────────────────────────
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.findOne(id, user);
  }

  // ── PATCH /tickets/:id ────────────────────────────────────────────────────
  // Metadata update (subject, description, priority, category) — agents only
  @Patch(':id')
  @Roles(RoleName.AGENT, RoleName.IT_ADMIN, RoleName.L2_L3, RoleName.MANAGER, RoleName.SYS_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.update(id, dto, user);
  }

  // ── POST /tickets/:id/assign ──────────────────────────────────────────────
  // Sets assignee and transitions to ASSIGNED atomically
  @Post(':id/assign')
  @Roles(RoleName.IT_ADMIN, RoleName.SYS_ADMIN)
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.assign(id, dto, user);
  }

  // ── POST /tickets/:id/transition ──────────────────────────────────────────
  // No @Roles here — any authenticated user may call this; service enforces
  // per-role constraints (employees may only cancel own, or close resolved own).
  @Post(':id/transition')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.transition(id, dto, user);
  }

  // ── PATCH /tickets/:id/status ─────────────────────────────────────────────
  // Legacy alias kept for backward compatibility — delegates to transition
  @Patch(':id/status')
  transitionLegacy(
    @Param('id') id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.transition(id, dto, user);
  }

  // ── POST /tickets/:id/comments ────────────────────────────────────────────
  // Adds a comment; isInternal notes visible only to agents
  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.addComment(id, dto, user);
  }

  // ── POST /tickets/:id/resolve ─────────────────────────────────────────────
  // Requires non-empty resolutionSummary; stored as StatusHistory.reason
  @Post(':id/resolve')
  @Roles(RoleName.AGENT, RoleName.IT_ADMIN)
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.resolve(id, dto, user);
  }
}
