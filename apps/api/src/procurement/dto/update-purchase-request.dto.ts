import { IsDecimal, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

// Editable fields for a draft (RAISED) purchase request — typically an
// auto-created PR whose placeholder estCost/budgetCode need filling in before
// it is submitted into the manager → finance approval chain.
export class UpdatePurchaseRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  itemSpec?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity?: number;

  @IsOptional()
  @IsDecimal()
  estCost?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  budgetCode?: string;
}
