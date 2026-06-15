import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports:     [AiModule, TicketsModule],
  controllers: [ChatController],
  providers:   [ChatService],
})
export class ChatModule {}
