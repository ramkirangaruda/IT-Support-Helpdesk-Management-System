import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  body: string;

  @IsBoolean()
  @IsOptional()
  isInternal?: boolean;
}
