import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsService } from './tickets.service';

const AGENT_ROLES = [
  RoleName.AGENT,
  RoleName.IT_ADMIN,
  RoleName.L2_L3,
  RoleName.MANAGER,
  RoleName.SYS_ADMIN,
] as const;

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // Any authenticated user can raise a ticket
  @Post()
  create(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.create(dto, user);
  }

  // Employees see only their own; agents/admins see all
  @Get()
  findAll(
    @Query() query: ListTicketsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.findAll(query, user);
  }

  // RBAC enforced in service (employee can only see own)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.findOne(id, user);
  }

  // Metadata update — agents/admins only
  @Patch(':id')
  @Roles(...AGENT_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.update(id, dto, user);
  }

  // Status transition — agents/admins; employees can only cancel own NEW ticket (enforced in service)
  @Patch(':id/status')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketsService.transition(id, dto, user);
  }
}
