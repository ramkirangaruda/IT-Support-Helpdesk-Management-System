import { IsOptional, IsString, MinLength } from 'class-validator';

export class ClassifyDto {
  @IsString()
  @MinLength(3)
  message: string;

  @IsString()
  @IsOptional()
  context?: string;
}
