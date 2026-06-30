import { IsEnum, IsOptional } from 'class-validator';
import { AccountStatus, RoleName } from '@prisma/client';

export class AssignRoleDto {
  // Caller-vs-target rules (can't grant SYS_ADMIN unless SYS_ADMIN, can't change own role,
  // can't change another SYS_ADMIN unless SYS_ADMIN) are enforced in the service.
  @IsEnum(RoleName)
  role: RoleName;
}

export class ListAllUsersDto {
  @IsEnum(AccountStatus)
  @IsOptional()
  accountStatus?: AccountStatus;

  @IsEnum(RoleName)
  @IsOptional()
  role?: RoleName;
}
