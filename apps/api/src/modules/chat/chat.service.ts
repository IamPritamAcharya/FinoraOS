import { Inject, Injectable } from '@nestjs/common';
import { FinanceAgent, type FinanceChatContext } from '@finora/agents';
import type { RequestPrincipal } from '@finora/platform';
import { apiLogger } from '../../common/api-logger.js';
import { AI_GATEWAY, type AiGateway } from '../../gateways/ai/ai.gateway.js';
import { FinanceToolsService } from '../agents/finance-tools.service.js';
import { ChatRepository } from './chat.repository.js';

const explicitRecord = /\b(?:pay_\d{5}|STL_\d{4}|EXC_\d{3}|INV_\d{4}|GST_\d{4})\b/i;
const explicitFinanceTopic =
  /\b(?:budget?|trans[a-z]*|tras[a-z]*|payments?|expenses?|spend|costs?|outflows?|settlements?|cash|forecast|tax|GST|invoices?|exceptions?|reconciliation|members?|users?|email|profile|organization)\b/i;
const followUpReference = /\b(?:it|that|those|them|same|the former|the latter)\b/i;

export const shouldUseConversationContext = (message: string) => {
  if (explicitRecord.test(message)) return false;
  if (followUpReference.test(message)) return true;
  if (explicitFinanceTopic.test(message)) return false;
  return message.trim().split(/\s+/).length <= 8;
};

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
    const availableContext = persistedContext.length ? persistedContext : clientContext;
    const useContext = shouldUseConversationContext(message);
    const context = useContext ? availableContext.slice(-8) : [];
    apiLogger.info('Finora agent run started', {
      threadId: thread.id,
      organizationId: principal.organizationId,
      contextMessages: context.length,
      contextMode: useContext ? 'follow-up' : 'standalone',
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
