import { Inject, Injectable } from '@nestjs/common';
import { FinanceAgent, type FinanceChatContext } from '@finora/agents';
import type { RequestPrincipal } from '@finora/platform';
import { apiLogger } from '../../common/api-logger.js';
import { AI_GATEWAY, type AiGateway } from '../../gateways/ai/ai.gateway.js';
import { FinanceToolsService } from '../agents/finance-tools.service.js';
import { ChatRepository } from './chat.repository.js';

@Injectable()
export class ChatService {
  constructor(
    @Inject(AI_GATEWAY) private readonly ai: AiGateway,
    private readonly tools: FinanceToolsService,
    private readonly chats: ChatRepository,
  ) {}

  async respond(
    principal: RequestPrincipal,
    message: string,
    clientContext: FinanceChatContext[] = [],
    threadId?: string,
  ) {
    const thread = await this.chats.getOrCreateThread(principal, {
      threadId,
      firstMessage: message,
    });
    const persistedContext = await this.chats.context(principal, thread.id);
    const context = persistedContext.length ? persistedContext : clientContext.slice(-12);
    apiLogger.info('Finora agent run started', {
      threadId: thread.id,
      organizationId: principal.organizationId,
      contextMessages: context.length,
    });
    const currentDate = new Date().toISOString();
    const result = await new FinanceAgent(
      { complete: async (input) => (await this.ai.complete(input)).text },
      this.tools.forPrincipal(principal, currentDate),
      5,
    ).run({ message, context, currentDate });
    const artifacts = result.observations.flatMap((item) => (item.artifact ? [item.artifact] : []));
    const references = [...new Set(result.observations.flatMap((item) => item.references ?? []))];
    const payload = {
      artifacts,
      activity: result.activity,
      references,
      clarified: result.clarified,
      fallbackReason: result.fallbackReason,
    };
    const persisted = await this.chats.saveExchange({
      principal,
      threadId: thread.id,
      userText: message,
      assistantText: result.text,
      payload,
      activity: result.activity,
    });
    apiLogger.info('Finora agent run completed', {
      threadId: thread.id,
      agentRunId: persisted.agentRun.id,
      toolCount: result.activity.length,
      fallbackReason: result.fallbackReason,
      diagnostics: result.diagnostics,
      clarified: result.clarified,
    });
    return {
      threadId: thread.id,
      messageId: persisted.assistantMessage.id,
      text: result.text,
      ...payload,
    };
  }

  listThreads(principal: RequestPrincipal) {
    return this.chats.listThreads(principal);
  }

  thread(principal: RequestPrincipal, threadId: string) {
    return this.chats.thread(principal, threadId);
  }
}
