import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { KBArticleStatus } from '@prisma/client';

export class UpdateArticleDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsEnum(KBArticleStatus)
  @IsOptional()
  status?: KBArticleStatus;
}
