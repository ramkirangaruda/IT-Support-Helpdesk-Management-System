import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleName } from '@prisma/client';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { DevicesService } from './devices.service';
import { ListDevicesDto } from './dto/list-devices.dto';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { ReturnDeviceDto } from './dto/return-device.dto';

const ADMIN_ROLES = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];

const ALLOWED_EXTS = new Set(['.xlsx', '.xls']);

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // POST /devices/import — import Excel file (IT_ADMIN, SYS_ADMIN)
  @Post('import')
  @Roles(...ADMIN_ROLES)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 },
  }))
  importDevices(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @UploadedFile() file: any,
    @Query('mode') mode: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      throw new BadRequestException('Only .xlsx and .xls files are supported');
    }
    const importMode = mode === 'commit' ? 'commit' : 'preview';
    return this.devicesService.importFromExcel(file.buffer, file.originalname, importMode, user);
  }

  // GET /devices/overdue — employees over device limit (IT_ADMIN, MANAGER)
  @Get('overdue')
  @Roles(RoleName.IT_ADMIN, RoleName.SYS_ADMIN, RoleName.MANAGER)
  getOverdue() {
    return this.devicesService.getOverdueEmployees();
  }

  // GET /devices — device register (IT_ADMIN, SYS_ADMIN), paginated
  @Get()
  @Roles(...ADMIN_ROLES)
  findAll(@Query() query: ListDevicesDto) {
    return this.devicesService.findAllDevices(query);
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
