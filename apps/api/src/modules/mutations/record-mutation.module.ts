import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AgentWriteService } from './agent-write.service.js';
import { RecordMutationController } from './record-mutation.controller.js';
import { RecordMutationService } from './record-mutation.service.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [RecordMutationController],
  providers: [AgentWriteService, RecordMutationService],
  exports: [RecordMutationService],
})
export class RecordMutationModule {}
