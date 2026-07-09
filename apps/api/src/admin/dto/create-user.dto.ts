import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { RoleName } from '@prisma/client';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEmail()
  @Transform(({ value }: { value: string }) => value.toLowerCase().trim())
  email: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  department: string;

  // A temporary password is generated server-side and emailed — never accepted from the client.
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one role must be assigned' })
  @IsEnum(RoleName, { each: true })
  roles: RoleName[];
}
