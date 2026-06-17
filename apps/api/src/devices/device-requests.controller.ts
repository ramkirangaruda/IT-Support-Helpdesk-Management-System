import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DeviceRequestStatus, RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { DevicesService } from './devices.service';
import { CreateDeviceRequestDto } from './dto/create-device-request.dto';
import { DeviceDecisionDto } from './dto/decision.dto';
import { AllocateDeviceDto } from './dto/allocate-device.dto';

const DECISION_ROLES = [RoleName.MANAGER, RoleName.IT_ADMIN, RoleName.SYS_ADMIN];
const ALLOCATE_ROLES = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];

@Controller('device-requests')
export class DeviceRequestsController {
  constructor(private readonly devicesService: DevicesService) {}

  // POST /device-requests — any authenticated user can raise a request
  @Post()
  create(
    @Body() dto: CreateDeviceRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.createRequest(dto, user);
  }

  // GET /device-requests — scoped: employee=own, manager=pending-approval, admin=all
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: DeviceRequestStatus,
  ) {
    return this.devicesService.listRequests(user, status);
  }

  // GET /device-requests/:id
  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.getRequest(id, user);
  }

  // POST /device-requests/:id/decision — MANAGER (+ IT_ADMIN / SYS_ADMIN)
  @Post(':id/decision')
  @Roles(...DECISION_ROLES)
  decide(
    @Param('id') id: string,
    @Body() dto: DeviceDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.makeDecision(id, dto, user);
  }

  // POST /device-requests/:id/allocate — IT_ADMIN / SYS_ADMIN
  @Post(':id/allocate')
  @Roles(...ALLOCATE_ROLES)
  allocate(
    @Param('id') id: string,
    @Body() dto: AllocateDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.allocate(id, dto, user);
  }
}
