import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../../gateways/ai/ai-gateway.module.js';
import { AgentsController } from './agents.controller.js';
import { AgentReadService } from './agent-read.service.js';
import { AgentsService } from './agents.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { FinanceToolsService } from './finance-tools.service.js';
import { RecordMutationModule } from '../mutations/record-mutation.module.js';
@Module({
  imports: [AiGatewayModule, AuthModule, RecordMutationModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentReadService, FinanceToolsService],
  exports: [AgentsService, AgentReadService, FinanceToolsService],
})
export class AgentsModule {}
