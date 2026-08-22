import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { FinanceModule } from '../finance/finance.module.js';
@Module({ imports: [FinanceModule], controllers: [ChatController], providers: [ChatService] })
export class ChatModule {}
