import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { AdminUsersService } from './admin-users.service';
import { AssignRoleDto, ListAllUsersDto } from './dto/assign-role.dto';
import { CreateUserDto } from './dto/create-user.dto';

const ADMIN_ROLES = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];

@Controller('admin/users')
@Roles(...ADMIN_ROLES)
export class AdminUserMgmtController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  // GET /api/admin/users?accountStatus=PENDING_APPROVAL | ?role=AGENT
  @Get()
  list(@Query() query: ListAllUsersDto) {
    return this.adminUsersService.listAll(query);
  }

  // POST /api/admin/users — create an account directly (active immediately); a temporary
  // password is generated server-side and emailed to the new user.
  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminUsersService.createUser(dto, actor);
  }

  // PATCH /api/admin/users/:id/role — IT_ADMIN / SYS_ADMIN (rules enforced in service)
  @Patch(':id/role')
  assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminUsersService.assignRole(id, dto, actor);
  }

  // PATCH /api/admin/users/:id/deactivate — SYS_ADMIN only (method-level @Roles overrides class)
  @Patch(':id/deactivate')
  @Roles(RoleName.SYS_ADMIN)
  deactivate(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.adminUsersService.deactivate(id, actor);
  }
}
