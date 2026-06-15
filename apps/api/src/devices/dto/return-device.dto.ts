import { IsOptional, IsString } from 'class-validator';

export class ReturnDeviceDto {
  @IsString() @IsOptional()
  conditionAtReturn?: string;
}
