import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { AiGatewayModule } from '../../gateways/ai/ai-gateway.module.js';
import { AgentsModule } from '../agents/agents.module.js';
@Module({
  imports: [AiGatewayModule, AgentsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
