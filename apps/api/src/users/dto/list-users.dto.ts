import { IsEnum, IsOptional } from 'class-validator';
import { RoleName } from '@prisma/client';

export class ListUsersDto {
  @IsEnum(RoleName)
  @IsOptional()
  role?: RoleName;
}
