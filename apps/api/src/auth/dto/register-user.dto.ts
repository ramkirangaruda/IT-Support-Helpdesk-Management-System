import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class RegisterUserDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEmail()
  @Transform(({ value }: { value: string }) => value.toLowerCase().trim())
  email: string;

  @IsString()
  @Length(10, 128, { message: 'Password must be at least 10 characters' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  password: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  department: string;
}
