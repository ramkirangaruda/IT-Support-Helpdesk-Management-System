import { Body, Controller, Get, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { AiAdapterService } from './ai-adapter.service';
import { ClassifyDto } from './dto/classify.dto';
import { ChatDto } from './dto/chat.dto';
import { AgentAssistDto } from './dto/agent-assist.dto';

const AGENT_ROLES = [
  RoleName.AGENT,
  RoleName.L2_L3,
  RoleName.IT_ADMIN,
  RoleName.SYS_ADMIN,
];

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiAdapterService) {}

  /** Any authenticated user can classify a message (used during chat-to-ticket) */
  @Post('classify')
  classify(@Body() dto: ClassifyDto) {
    return this.ai.classify({ message: dto.message, context: dto.context });
  }

  /** Any authenticated user can chat */
  @Post('chat')
  chat(@Body() dto: ChatDto) {
    return this.ai.chat({
      session_id: dto.session_id,
      message:    dto.message,
      history:    dto.history,
    });
  }

  /** Agents and above only */
  @Post('agent-assist')
  @Roles(...AGENT_ROLES)
  agentAssist(@Body() dto: AgentAssistDto) {
    return this.ai.agentAssist({
      ticket_id:      dto.ticket_id,
      ticket_summary: dto.ticket_summary,
      comments:       dto.comments,
      action:         dto.action,
    });
  }

  /** Health proxy — useful for monitoring dashboards */
  @Get('health')
  health() {
    return this.ai.isHealthy().then(ok => ({ ai_service: ok ? 'up' : 'down' }));
  }
}
