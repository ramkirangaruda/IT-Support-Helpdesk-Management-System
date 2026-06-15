import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // POST /chat/sessions — creates a new session for the authenticated user
  @Post('sessions')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createSession(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.createSession(user);
  }

  // POST /chat/sessions/:id/messages — send a message, get AI reply
  @Post('sessions/:id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.sendMessage(id, dto, user);
  }

  // GET /chat/sessions/:id/messages — fetch full history (used to restore drawer)
  @Get('sessions/:id/messages')
  getMessages(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.getMessages(id, user);
  }
}
