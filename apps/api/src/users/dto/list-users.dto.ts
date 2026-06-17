import { IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { RoleName } from '@prisma/client';

export class ListUsersDto {
  @IsEnum(RoleName)
  @IsOptional()
  role?: RoleName;

  // Accepts comma-separated roles: ?roles=AGENT,L2_L3
  @IsEnum(RoleName, { each: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((s: string) => s.trim()) : value))
  roles?: RoleName[];
}
