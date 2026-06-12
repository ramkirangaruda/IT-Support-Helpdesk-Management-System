import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Priority } from '@prisma/client';

export class UpdateTicketDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsString()
  @IsOptional()
  assigneeId?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;
}
