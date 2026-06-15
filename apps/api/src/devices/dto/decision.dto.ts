import { IsEnum, IsString, MinLength, ValidateIf } from 'class-validator';

export enum DecisionValue {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class DeviceDecisionDto {
  @IsEnum(DecisionValue)
  decision: DecisionValue;

  @ValidateIf(o => o.decision === DecisionValue.REJECTED)
  @IsString()
  @MinLength(1)
  comment?: string;
}
