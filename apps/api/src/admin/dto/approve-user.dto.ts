import { IsArray, ArrayMinSize, IsEnum } from 'class-validator';
import { RoleName } from '@prisma/client';

export class ApproveUserDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one role must be assigned' })
  @IsEnum(RoleName, { each: true })
  roles: RoleName[];
}
