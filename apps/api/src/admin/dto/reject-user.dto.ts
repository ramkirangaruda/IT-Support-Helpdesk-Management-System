import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectUserDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
