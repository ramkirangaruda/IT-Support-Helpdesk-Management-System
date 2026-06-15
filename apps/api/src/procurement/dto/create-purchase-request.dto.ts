import { IsDecimal, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseRequestDto {
  @IsOptional()
  @IsString()
  deviceRequestId?: string;

  @IsString()
  @MinLength(3)
  itemSpec: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsDecimal()
  estCost: string;

  @IsString()
  @MinLength(1)
  budgetCode: string;
}
