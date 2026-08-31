import { Inject, Injectable } from '@nestjs/common';
import { FinanceAgent, type FinanceChatContext } from '@finora/agents';
import type { RequestPrincipal } from '@finora/platform';
import { apiLogger } from '../../common/api-logger.js';
import { AI_GATEWAY, type AiGateway } from '../../gateways/ai/ai.gateway.js';
import { FinanceToolsService } from '../agents/finance-tools.service.js';
import { ChatRepository } from './chat.repository.js';

const explicitRecord =
  /\b(?:pay_\d{5}|STL_\d{4}|EXC_(?:[A-Z0-9]+_)?\d{3}|INV_\d{4}|GST_\d{4}|EXP_\d{4})\b/i;
const explicitFinanceTopic =
  /\b(?:budgets?|trans[a-z]*|tras[a-z]*|payments?|expenses?|claims?|receipts?|reimburse\w*|spend|costs?|outflows?|settlements?|cash|liquidity|runway|forecast|tax|GST|invoices?|exceptions?|reconciliation|members?|users?|email|profile|organization|audit|agents?)\b/i;
const followUpReference = /\b(?:it|that|those|them|same|the former|the latter)\b/i;

export const shouldUseConversationContext = (message: string) => {
  if (explicitRecord.test(message)) return false;
  if (followUpReference.test(message)) return true;
  if (explicitFinanceTopic.test(message)) return false;
  return message.trim().split(/\s+/).length <= 8;
};

const mutationIntent = /\b(?:change|update|edit|set|correct|replace|mark)\b/i;
const clarificationPrompt =
  /(?:\?|\b(?:which|what exact|exact .* reference|are you requesting|do you mean|please specify)\b)/i;

export const shouldResumePendingWrite = (context: FinanceChatContext[], writeMode: boolean) => {
  if (!writeMode || context.length < 2) return false;
  const latest = context.at(-1);
  if (latest?.role !== 'assistant' || !clarificationPrompt.test(latest.text)) return false;
  return context
    .slice(-6, -1)
    .some((item) => item.role === 'user' && mutationIntent.test(item.text));
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
    writeMode = false,
  ) {
    const thread = await this.chats.getOrCreateThread(principal, {
      threadId,
      firstMessage: message,
    });
    const persistedContext = await this.chats.context(principal, thread.id);
    const availableContext = persistedContext.length ? persistedContext : clientContext;
    const resumingWrite = shouldResumePendingWrite(availableContext, writeMode);
    const useContext = resumingWrite || shouldUseConversationContext(message);
    const context = useContext ? availableContext.slice(-8) : [];
    apiLogger.info('Finora agent run started', {
      threadId: thread.id,
      organizationId: principal.organizationId,
      contextMessages: context.length,
      contextMode: resumingWrite ? 'pending-write' : useContext ? 'follow-up' : 'standalone',
      writeMode,
    });
    const currentDate = new Date().toISOString();
    const skills = await this.tools.activeSkills(principal);
    const allowedTools = this.tools.allowedTools(principal, writeMode);
    apiLogger.info('Finora routing context prepared', {
      threadId: thread.id,
      organizationId: principal.organizationId,
      role: principal.role ?? 'EMPLOYEE',
      allowedToolCount: allowedTools.length,
    });
    let gateway: { provider: string; model: string; fallbackFrom?: string } | undefined;
    const result = await new FinanceAgent(
      {
        complete: async (input) => {
          const completion = await this.ai.complete(input);
          gateway = completion;
          return completion.text;
        },
      },
      this.tools.forPrincipal(principal, currentDate, { writeMode, threadId: thread.id }),
      5,
    ).run({
      message,
      context,
      currentDate,
      skills,
      writeMode,
      actor: { role: principal.role ?? 'EMPLOYEE', allowedTools },
    });
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
      skillId: result.skillId,
      gateway,
    });
    apiLogger.info('Finora agent run completed', {
      threadId: thread.id,
      agentRunId: persisted.agentRun.id,
      toolCount: result.activity.length,
      fallbackReason: result.fallbackReason,
      diagnostics: result.diagnostics,
      clarified: result.clarified,
      skillId: result.skillId,
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
