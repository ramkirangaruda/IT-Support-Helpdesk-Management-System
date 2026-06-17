import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { AdminUsersService } from './admin-users.service';
import { ApproveUserDto } from './dto/approve-user.dto';
import { RejectUserDto } from './dto/reject-user.dto';

const ADMIN_ROLES = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];

@Controller('admin/pending-users')
@Roles(...ADMIN_ROLES)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  // GET /api/admin/pending-users
  @Get()
  listPending() {
    return this.adminUsersService.listPending();
  }

  // POST /api/admin/pending-users/:id/approve
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminUsersService.approve(id, dto, actor.id);
  }

  // POST /api/admin/pending-users/:id/reject
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminUsersService.reject(id, dto, actor.id);
  }
}
