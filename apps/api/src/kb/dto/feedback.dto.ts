import { IsBoolean } from 'class-validator';

export class FeedbackDto {
  @IsBoolean()
  helpful: boolean;
}
