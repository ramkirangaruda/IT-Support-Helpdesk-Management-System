import { IsArray, IsEnum, IsString, MinLength } from 'class-validator';

export enum AgentAssistAction {
  SUMMARISE         = 'summarise',
  DRAFT_REPLY       = 'draft_reply',
  SUGGEST_FIX       = 'suggest_fix',
  DRAFT_KB_ARTICLE  = 'draft_kb_article',
}

export class AgentAssistDto {
  @IsString()
  ticket_id: string;

  @IsString()
  @MinLength(5)
  ticket_summary: string;

  @IsArray()
  @IsString({ each: true })
  comments: string[] = [];

  @IsEnum(AgentAssistAction)
  action: AgentAssistAction;
}
