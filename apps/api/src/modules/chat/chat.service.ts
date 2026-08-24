import { Inject, Injectable } from '@nestjs/common';
import { ControllerAgent, type ChatContextEntry } from '@finora/agents';
import { formatInr, money } from '@finora/platform';
import { apiLogger } from '../../common/api-logger.js';
import { AI_GATEWAY, type AiGateway } from '../../gateways/ai/ai.gateway.js';
import { FinanceService } from '../finance/finance.service.js';
import { AgentsService } from '../agents/agents.service.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';

const controller = new ControllerAgent();
@Injectable()
export class ChatService {
  constructor(
    @Inject(AI_GATEWAY) private readonly ai: AiGateway,
    private readonly finance: FinanceService,
    private readonly agents: AgentsService,
    private readonly reconciliation: ReconciliationService,
  ) {}
  async respond(message: string, context: ChatContextEntry[] = []) {
    const decision = controller.route(message, context);
    apiLogger.info('Chat request routed to controlled capability', {
      intent: decision.intent,
      reference: decision.reference,
      hasConversationContext: context.length > 0,
    });
    switch (decision.intent) {
      case 'SETTLEMENT_LOOKUP':
        return this.settlementResponse(decision.reference!);
      case 'EXCEPTION_LOOKUP':
        return this.exceptionResponse(decision.reference!);
      case 'EXCEPTION_INVESTIGATION':
        return this.investigateException(decision.reference!);
      case 'EXCEPTION_LIST':
        return this.exceptionListResponse(decision.minimumAmount);
      case 'CASH_FORECAST':
        return this.cashForecastResponse();
      case 'TAX_MISMATCH_LIST':
        return this.taxMismatchResponse();
      case 'GENERAL':
        return { kind: 'general', text: await this.safeGeneralResponse(message) };
    }
  }

  private async settlementResponse(reference: string) {
    const settlements = await this.finance.settlements();
    const found = settlements.find((item) => item.externalId === reference);
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
    const exception = await this.reconciliation.exceptionByExternalId(reference);
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
    const exceptions = await this.reconciliation.exceptionsForChat(minimumAmount);
    if (!exceptions.length) {
      return {
        kind: 'exception-list',
        text: `No open exceptions${minimumAmount ? ` above ${formatInr(minimumAmount)}` : ''} were found.`,
      };
    }
    const rows = exceptions.map(
      (item) =>
        `${item.externalId} · ${formatInr(item.variance)} · ${item.status.toLowerCase().replaceAll('_', ' ')}`,
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
    const forecast = await this.finance.forecast();
    const rows = forecast.map(
      (item) => `${item.day} · ${formatInr(item.amount)}${item.risk ? ' · shortfall risk' : ''}`,
    );
    return {
      kind: 'cash-forecast',
      text: `Known cash forecast:\n${rows.join('\n')}\n\nThis baseline uses seeded balances and scheduled demo outflows; it does not invent future cash movements.`,
      forecast,
    };
  }

  private async taxMismatchResponse() {
    const taxLines = await this.finance.taxLines();
    const unmatched = taxLines.filter((line) => !line.matched).slice(0, 10);
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
