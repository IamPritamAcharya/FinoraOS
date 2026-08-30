import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { AiGatewayModule } from './gateways/ai/ai-gateway.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module.js';
import { AgentsModule } from './modules/agents/agents.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { WorkspaceModule } from './modules/workspace/workspace.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { RecordMutationModule } from './modules/mutations/record-mutation.module.js';
@Module({
  imports: [
    PrismaModule,
    AiGatewayModule,
    AuthModule,
    FinanceModule,
    ReconciliationModule,
    AgentsModule,
    ChatModule,
    WorkspaceModule,
    AuditModule,
    RecordMutationModule,
  ],
})
export class AppModule {}
