import { Module } from '@nestjs/common';
import { AiAdapterService } from './ai-adapter.service';
import { AiController } from './ai.controller';

@Module({
  providers:   [AiAdapterService],
  controllers: [AiController],
  exports:     [AiAdapterService],   // other modules (e.g. TicketsModule) can inject it
})
export class AiModule {}
