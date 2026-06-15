import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateDeviceRequestDto {
  @IsString() @MinLength(1) @MaxLength(100)
  deviceType: string;

  @IsString() @MinLength(10) @MaxLength(1000)
  justification: string;
}
