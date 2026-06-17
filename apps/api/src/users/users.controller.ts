import { Controller, Get, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListUsersDto } from './dto/list-users.dto';
import { UsersService } from './users.service';

@Controller('users')
@Roles(RoleName.IT_ADMIN, RoleName.SYS_ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query() query: ListUsersDto) {
    const roles = query.roles ?? (query.role ? [query.role] : undefined);
    return this.usersService.findAll(roles);
  }
}
