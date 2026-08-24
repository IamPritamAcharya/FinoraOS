import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../../gateways/ai/ai-gateway.module.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
@Module({
  imports: [AiGatewayModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
