import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { KBArticleStatus } from '@prisma/client';

export class ListArticlesDto {
  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsEnum(KBArticleStatus)
  @IsOptional()
  status?: KBArticleStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
