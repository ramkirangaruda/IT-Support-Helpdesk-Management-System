import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ApprovePrDecision {
  APPROVED  = 'APPROVED',
  REJECTED  = 'REJECTED',
  ON_HOLD   = 'ON_HOLD',
}

export class ApprovePrDto {
  @IsEnum(ApprovePrDecision)
  decision: ApprovePrDecision;

  @IsOptional()
  @IsString()
  comment?: string;
}
