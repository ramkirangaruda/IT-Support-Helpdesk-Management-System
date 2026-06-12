import { IsString, MinLength } from 'class-validator';

export class ResolveTicketDto {
  @IsString()
  @MinLength(1, { message: 'resolutionSummary must not be empty' })
  resolutionSummary: string;
}
