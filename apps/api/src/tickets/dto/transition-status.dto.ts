import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class TransitionStatusDto {
  @IsEnum(TicketStatus)
  toStatus: TicketStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}
