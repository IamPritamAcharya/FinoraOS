import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { AiGatewayModule } from '../../gateways/ai/ai-gateway.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ChatRepository } from './chat.repository.js';
@Module({
  imports: [AiGatewayModule, AgentsModule, AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository],
})
export class ChatModule {}
