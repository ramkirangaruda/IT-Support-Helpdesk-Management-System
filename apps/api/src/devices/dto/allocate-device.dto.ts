import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class AllocateDeviceDto {
  @IsString() @MinLength(1)
  deviceId: string;

  @IsString() @MinLength(1)
  conditionAtIssue: string;

  @IsDateString() @IsOptional()
  expectedReturn?: string;
}
