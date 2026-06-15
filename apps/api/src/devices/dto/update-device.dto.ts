import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { DeviceStatus } from '@prisma/client';

export class UpdateDeviceDto {
  @IsString() @IsOptional()
  makeModel?: string;

  @IsString() @IsOptional()
  serialNumber?: string;

  @IsEnum(DeviceStatus) @IsOptional()
  status?: DeviceStatus;

  @IsString() @IsOptional()
  condition?: string;

  @IsDateString() @IsOptional()
  purchasedOn?: string;

  @IsNumber() @IsOptional()
  cost?: number;
}
