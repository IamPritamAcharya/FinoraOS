import { Inject, Injectable } from '@nestjs/common';
import { formatInr, money } from '@finora/platform';
import { apiLogger } from '../../common/api-logger.js';
import { AI_GATEWAY, type AiGateway } from '../../gateways/ai/ai.gateway.js';
import { FinanceService } from '../finance/finance.service.js';
@Injectable()
export class ChatService {
  constructor(
    @Inject(AI_GATEWAY) private readonly ai: AiGateway,
    private readonly finance: FinanceService,
  ) {}
  async respond(message: string) {
    const settlements = await this.finance.settlements();
    const found = settlements.find((item) =>
      message.toLowerCase().includes(item.externalId.toLowerCase()),
    );
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
    apiLogger.info('General chat request will use the configured AI gateway');
    return {
      kind: 'general',
      text: await this.safeGeneralResponse(message),
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
