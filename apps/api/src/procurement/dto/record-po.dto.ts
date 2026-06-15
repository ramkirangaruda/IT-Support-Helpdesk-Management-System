import { IsDecimal, IsString, MinLength } from 'class-validator';

export class RecordPoDto {
  @IsString()
  @MinLength(1)
  poNumber: string;

  @IsString()
  @MinLength(1)
  vendorId: string;

  @IsDecimal()
  actualCost: string;
}
