import { IsDateString, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDeviceDto {
  @IsString() @MinLength(1)
  type: string;

  @IsString() @MinLength(1)
  makeModel: string;

  @IsString() @MinLength(1)
  serialNumber: string;

  @IsString() @IsOptional()
  condition?: string;

  @IsDateString() @IsOptional()
  purchasedOn?: string;

  @IsNumber() @IsOptional()
  cost?: number;
}
