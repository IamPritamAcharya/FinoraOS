import { Inject, Injectable } from '@nestjs/common';
import { ControllerAgent, type ChatContextEntry } from '@finora/agents';
import { formatInr, money } from '@finora/platform';
import { apiLogger } from '../../common/api-logger.js';
import { AI_GATEWAY, type AiGateway } from '../../gateways/ai/ai.gateway.js';
import { AgentsService } from '../agents/agents.service.js';
import { AgentReadService } from '../agents/agent-read.service.js';

@Injectable()
export class ChatService {
  constructor(
    @Inject(AI_GATEWAY) private readonly ai: AiGateway,
    private readonly agents: AgentsService,
    private readonly agentRead: AgentReadService,
  ) {}
  async respond(message: string, context: ChatContextEntry[] = []) {
    const route = await new ControllerAgent({
      complete: async (input) => (await this.ai.complete(input)).text,
    }).routeDetailed(message, context);
    const decision = route.decision;
    if (route.source === 'fallback') {
      apiLogger.warn('Chat controller fell back to general conversation', {
        reason: route.fallbackReason,
        hasConversationContext: context.length > 0,
      });
    } else {
      apiLogger.info('Chat controller selected controlled capability', {
        tool: decision.tool,
        hasConversationContext: context.length > 0,
      });
    }
    switch (decision.tool) {
      case 'getSettlement':
        return this.settlementResponse(decision.arguments.settlementId);
      case 'getException':
        return this.exceptionResponse(decision.arguments.exceptionId);
      case 'investigateException':
        return this.investigateException(decision.arguments.exceptionId);
      case 'findExceptions':
        return this.exceptionListResponse(decision.arguments.minimumAmount);
      case 'getCashForecast':
        return this.cashForecastResponse();
      case 'findUnmatchedTaxLines':
        return this.taxMismatchResponse();
      case 'findTransactions':
        return this.transactionsResponse(decision.arguments);
      case 'findInvoices':
        return this.invoicesResponse(decision.arguments.limit);
      case 'findAuditEvents':
        return this.auditEventsResponse(decision.arguments.limit);
      case 'findAgentRuns':
        return this.agentRunsResponse(decision.arguments.limit);
      case 'findReconciliationRuns':
        return this.reconciliationRunsResponse(decision.arguments.limit);
      case 'getExceptionEvidence':
        return this.exceptionEvidenceResponse(decision.arguments.exceptionId);
      case 'getOrganizationSummary':
        return this.organizationUserCountResponse();
      case 'listOrganizationUsers':
        return this.organizationUserListResponse();
      case 'general':
        return { kind: 'general', text: await this.safeGeneralResponse(message) };
    }
  }

  private async settlementResponse(reference: string) {
    const found = await this.agentRead.getSettlement('demo-org', reference);
    if (found) {
      apiLogger.info('Settlement chat request matched controlled record', {
        settlementId: found.externalId,
      });
      const difference = money(found.expectedAmount).minus(found.receivedAmount);
      const recordedAdjustments = money(found.feeAmount)
        .plus(found.gstAmount)
        .plus(found.refundAmount);
      const fullyExplained = difference.equals(recordedAdjustments);
      apiLogger.info('Settlement variance calculated deterministically', {
        settlementId: found.externalId,
        fullyExplained,
      });
      const deterministicExplanation = fullyExplained
        ? `${found.externalId} is short by ${formatInr(difference)}. Gateway fees of ${formatInr(found.feeAmount)}, GST of ${formatInr(found.gstAmount)}, and refunds of ${formatInr(found.refundAmount)} exactly explain the difference. There is no unexplained variance.`
        : `${found.externalId} is short by ${formatInr(difference)}. Recorded fees, GST, and refunds total ${formatInr(recordedAdjustments)}, leaving ${formatInr(difference.minus(recordedAdjustments))} for human review.`;
      const aiExplanation = await this.safeExplanation(fullyExplained);
      return {
        kind: 'settlement',
        text: deterministicExplanation,
        aiExplanation,
        settlement: found,
      };
    }
    return {
      kind: 'settlement-not-found',
      text: `I could not find ${reference} in this workspace. Check the settlement ID and try again.`,
    };
  }

  private async exceptionResponse(reference: string) {
    const exception = await this.agentRead.getException('demo-org', reference);
    if (!exception) {
      return {
        kind: 'exception-not-found',
        text: `I could not find ${reference} in this workspace. Check the exception ID and try again.`,
      };
    }
    const variance = money(exception.expectedAmount.toString()).minus(
      exception.receivedAmount.toString(),
    );
    const nextStep = exception.resolution
      ? 'A proposal already exists; review it before any approval.'
      : `Ask “Investigate ${exception.externalId}” to create a traceable proposal.`;
    return {
      kind: 'exception',
      text: `${exception.externalId} is ${exception.status.toLowerCase().replaceAll('_', ' ')} with a variance of ${formatInr(variance)}. ${exception.reason} ${nextStep}`,
      exception,
    };
  }

  private async investigateException(reference: string) {
    const investigation = await this.agents.investigateByExternalId(reference);
    if (!investigation) {
      return {
        kind: 'exception-not-found',
        text: `I could not find ${reference} in this workspace. Check the exception ID and try again.`,
      };
    }
    const { result } = investigation;
    apiLogger.info('Chat exception investigation completed', {
      exceptionId: investigation.externalId,
      status: result.status,
      confidence: result.confidence,
    });
    return {
      kind: 'exception-investigation',
      text: `${investigation.externalId} has been investigated. ${result.reason} ${result.explanation}`,
      exception: {
        externalId: investigation.externalId,
        status: result.status,
        confidence: result.confidence,
        proposedActions: result.proposedActions,
      },
    };
  }

  private async exceptionListResponse(minimumAmount?: string) {
    const exceptions = await this.agentRead.findExceptions('demo-org', minimumAmount);
    if (!exceptions.length) {
      return {
        kind: 'exception-list',
        text: `No open exceptions${minimumAmount ? ` above ${formatInr(minimumAmount)}` : ''} were found.`,
      };
    }
    const rows = exceptions.map(
      (item) =>
        `${item.externalId} · ${formatInr(item.expectedAmount.minus(item.receivedAmount))} · ${item.status.toLowerCase().replaceAll('_', ' ')}`,
    );
    return {
      kind: 'exception-list',
      text: `${exceptions.length} open exception${exceptions.length === 1 ? '' : 's'}${minimumAmount ? ` above ${formatInr(minimumAmount)}` : ''}:
${rows.join('\n')}

Ask “Investigate EXC_###” to create a proposal for one exception.`,
      exceptions,
    };
  }

  private async cashForecastResponse() {
    const forecast = await this.agentRead.cashForecast('demo-org');
    const rows = forecast.map(
      (item) =>
        `${item.day} · ${formatInr(item.amount.toString())}${item.risk ? ' · shortfall risk' : ''}`,
    );
    return {
      kind: 'cash-forecast',
      text: `Known cash forecast:\n${rows.join('\n')}\n\nThis baseline uses seeded balances and scheduled demo outflows; it does not invent future cash movements.`,
      forecast,
    };
  }

  private async taxMismatchResponse() {
    const unmatched = await this.agentRead.findUnmatchedTaxLines('demo-org');
    if (!unmatched.length)
      return { kind: 'tax-mismatch-list', text: 'All available tax lines are matched.' };
    const rows = unmatched.map(
      (line) => `${line.externalId} · ${formatInr(line.amount.toString())} · ${line.taxRate}% GST`,
    );
    return {
      kind: 'tax-mismatch-list',
      text: `${unmatched.length} tax line${unmatched.length === 1 ? '' : 's'} need matching:\n${rows.join('\n')}\n\nThese are deterministic seeded tax-line relationships; investigation of ambiguous tax evidence is the next controlled workflow.`,
      taxLines: unmatched,
    };
  }

  private async organizationUserCountResponse() {
    const summary = await this.agentRead.organizationSummary('demo-org');
    return {
      kind: 'organization-user-count',
      text: `There ${summary.users === 1 ? 'is' : 'are'} ${summary.users} user${summary.users === 1 ? '' : 's'} in this organization. This answer was read through the tenant-scoped agent database role.`,
    };
  }

  private async organizationUserListResponse() {
    const users = await this.agentRead.listUsers('demo-org');
    return {
      kind: 'organization-user-list',
      text: users.length
        ? `Organization users:\n${users.map((user) => `${user.name} · ${user.email}`).join('\n')}`
        : 'No users were found in this organization.',
    };
  }

  private async transactionsResponse(input: {
    minimumAmount?: string;
    status?: 'CAPTURED' | 'REFUNDED' | 'PENDING';
    limit?: number;
  }) {
    const rows = await this.agentRead.findTransactions('demo-org', {
      minimumAmount: input.minimumAmount,
      status: input.status,
      take: input.limit,
    });
    return {
      kind: 'transactions',
      text: rows.length
        ? `Transactions:\n${rows.map((row) => `${row.externalId} · ${formatInr(row.amount.toString())} · ${row.status}`).join('\n')}`
        : 'No transactions matched those filters.',
    };
  }
  private async invoicesResponse(limit?: number) {
    const rows = await this.agentRead.findInvoices('demo-org', limit);
    return {
      kind: 'invoices',
      text: rows.length
        ? `Invoices:\n${rows.map((row) => `${row.externalId} · ${formatInr(row.amount.toString())}`).join('\n')}`
        : 'No invoices were found.',
    };
  }
  private async auditEventsResponse(limit?: number) {
    const rows = await this.agentRead.findAuditEvents('demo-org', limit);
    return {
      kind: 'audit-events',
      text: rows.length
        ? `Recent audit events:\n${rows.map((row) => `${row.actor} · ${row.action} · ${row.entityType}`).join('\n')}`
        : 'No audit events were found.',
    };
  }
  private async agentRunsResponse(limit?: number) {
    const rows = await this.agentRead.findAgentRuns('demo-org', limit);
    return {
      kind: 'agent-runs',
      text: rows.length
        ? `Recent agent activity:\n${rows.map((row) => `${row.agentType} · ${row.status}`).join('\n')}`
        : 'No agent runs were found.',
    };
  }
  private async reconciliationRunsResponse(limit?: number) {
    const rows = await this.agentRead.findReconciliationRuns('demo-org', limit);
    return {
      kind: 'reconciliation-runs',
      text: rows.length
        ? `Reconciliation runs:\n${rows.map((row) => `${row.status} · ${row.recordsProcessed} records · ${row.exceptionsGenerated} exceptions`).join('\n')}`
        : 'No reconciliation runs were found.',
    };
  }
  private async exceptionEvidenceResponse(exceptionId: string) {
    const rows = await this.agentRead.findExceptionEvidence('demo-org', exceptionId);
    return {
      kind: 'exception-evidence',
      text: rows.length
        ? `Evidence for ${exceptionId}:\n${rows.map((row) => `${row.label}${row.referenceId ? ` · ${row.referenceId}` : ''}`).join('\n')}`
        : `No evidence was found for ${exceptionId}.`,
    };
  }

  private async safeExplanation(fullyExplained: boolean) {
    const fallback = fullyExplained
      ? 'The documented settlement adjustments account for the result.'
      : 'The remaining variance should be reviewed with the supporting records.';
    try {
      const completion = await this.ai.complete({
        system:
          'You are a finance operations assistant. Reply with one concise sentence and no numbers, amounts, currencies, identifiers, calculations, or new facts.',
        prompt: fullyExplained
          ? 'Explain qualitatively that documented settlement adjustments account for the result.'
          : 'Explain qualitatively that a remaining settlement variance needs human review.',
      });
      const response = completion.text.replace(/\s+/g, ' ').trim();
      const accepted = response.length > 0 && response.length <= 280 && !/[0-9₹$]/.test(response);
      apiLogger.info('Settlement chat AI explanation completed', {
        provider: completion.provider,
        model: completion.model,
        fallbackFrom: completion.fallbackFrom,
        accepted,
      });
      return accepted ? response : fallback;
    } catch (error) {
      apiLogger.warn('Settlement chat AI explanation fell back to deterministic copy', {
        error: error instanceof Error ? error.message : 'Unknown AI gateway error',
      });
      return fallback;
    }
  }

  private async safeGeneralResponse(message: string) {
    const fallback =
      'I’m Finora, the FinoraOS finance operations assistant. I can help investigate settlements, reconciliation exceptions, records, and cash visibility using controlled financial evidence.';
    try {
      const completion = await this.ai.complete({
        system:
          'You are Finora, the conversational assistant inside FinoraOS. Answer greetings, identity questions, and navigation questions concisely and professionally. Do not claim to have accessed financial records unless controlled evidence was supplied. Never invent amounts, transactions, settlements, policies, or capabilities. For a finance-data question without a specific controlled record, explain what identifier or context is needed.',
        prompt: message,
      });
      const response = completion.text.replace(/\s+/g, ' ').trim();
      const accepted = response.length > 0 && response.length <= 420;
      apiLogger.info('General chat AI response completed', {
        provider: completion.provider,
        model: completion.model,
        fallbackFrom: completion.fallbackFrom,
        accepted,
      });
      return accepted ? response : fallback;
    } catch (error) {
      apiLogger.warn('General chat AI response fell back to Finora introduction', {
        error: error instanceof Error ? error.message : 'Unknown AI gateway error',
      });
      return fallback;
    }
  }
}
