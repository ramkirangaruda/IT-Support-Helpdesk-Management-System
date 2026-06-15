import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ChatMessageDto {
  @IsEnum(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

export class ChatDto {
  @IsString()
  session_id: string;

  @IsString()
  @MinLength(1)
  message: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history: ChatMessageDto[] = [];
}
