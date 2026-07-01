import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Priority, TicketStatus } from '@prisma/client';

export class ListTicketsDto {
  // "My Tickets" view: return tickets the caller RAISED, regardless of their role scope
  // (so agents/admins see tickets they raised — e.g. via the chatbot — not just assigned).
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  raisedByMe?: boolean;

  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsString()
  @IsOptional()
  assigneeId?: string;

  @IsString()
  @IsOptional()
  requesterId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
