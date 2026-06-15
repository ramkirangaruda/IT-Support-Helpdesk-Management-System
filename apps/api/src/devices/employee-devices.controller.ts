import { Controller, Get, Param } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { DevicesService } from './devices.service';

@Controller('employees')
export class EmployeeDevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // GET /employees/:id/devices — devices held by employee (IT_ADMIN, MANAGER)
  @Get(':id/devices')
  @Roles(RoleName.IT_ADMIN, RoleName.SYS_ADMIN, RoleName.MANAGER)
  getEmployeeDevices(@Param('id') id: string) {
    return this.devicesService.getEmployeeDevices(id);
  }
}
