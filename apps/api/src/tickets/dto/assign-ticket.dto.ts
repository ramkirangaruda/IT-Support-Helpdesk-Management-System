import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Priority } from '@prisma/client';

export class AssignTicketDto {
  @IsString()
  @IsNotEmpty()
  assigneeId: string;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsString()
  @IsOptional()
  categoryId?: string;
}
