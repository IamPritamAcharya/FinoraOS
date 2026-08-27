import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MessagingGatewayModule } from '../../gateways/messaging/messaging-gateway.module.js';
import { DocumentStorageGatewayModule } from '../../gateways/document-storage/document-storage-gateway.module.js';
import { WorkspaceController } from './workspace.controller.js';
import { WorkspaceService } from './workspace.service.js';
import { WorkspaceScheduler } from './workspace.scheduler.js';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentGatewayModule } from '../../gateways/payment/payment-gateway.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MessagingGatewayModule,
    DocumentStorageGatewayModule,
    AuthModule,
    PaymentGatewayModule,
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceScheduler],
})
export class WorkspaceModule {}
