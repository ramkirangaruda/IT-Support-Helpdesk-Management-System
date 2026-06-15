import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { ReturnDeviceDto } from './dto/return-device.dto';

const ADMIN_ROLES = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // GET /devices — device register (IT_ADMIN, SYS_ADMIN)
  @Get()
  @Roles(...ADMIN_ROLES)
  findAll() {
    return this.devicesService.findAllDevices();
  }

  // GET /devices/:id
  @Get(':id')
  @Roles(...ADMIN_ROLES)
  findOne(@Param('id') id: string) {
    return this.devicesService.findDevice(id);
  }

  // POST /devices — create device entry (IT_ADMIN)
  @Post()
  @Roles(...ADMIN_ROLES)
  create(
    @Body() dto: CreateDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.createDevice(dto, user);
  }

  // PATCH /devices/:id — update device (IT_ADMIN)
  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.updateDevice(id, dto, user);
  }

  // POST /devices/:id/return — record return (IT_ADMIN)
  @Post(':id/return')
  @Roles(...ADMIN_ROLES)
  recordReturn(
    @Param('id') id: string,
    @Body() dto: ReturnDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.devicesService.recordReturn(id, dto, user);
  }
}
