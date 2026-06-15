import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { KbController } from './kb.controller';
import { KbService } from './kb.service';

@Module({
  imports:     [AiModule],
  controllers: [KbController],
  providers:   [KbService],
})
export class KbModule {}
