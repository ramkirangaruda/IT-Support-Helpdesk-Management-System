import { IsOptional, IsString, MinLength } from 'class-validator';

export class RecordReceiptDto {
  @IsString()
  @MinLength(1)
  type: string;

  @IsOptional()
  @IsString()
  makeModel?: string;

  @IsString()
  @MinLength(1)
  serialNumber: string;

  @IsOptional()
  @IsString()
  condition?: string;
}
