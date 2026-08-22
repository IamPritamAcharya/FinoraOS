import { Inject, Injectable } from '@nestjs/common';
import { formatInr, money } from '@finora/platform';
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
      const difference = money(found.expectedAmount).minus(found.receivedAmount);
      const recordedAdjustments = money(found.feeAmount)
        .plus(found.gstAmount)
        .plus(found.refundAmount);
      const fullyExplained = difference.equals(recordedAdjustments);
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
      kind: 'general',
      text: 'I can investigate a settlement ID, show unresolved exceptions, or explain the seven-day cash forecast. I only use controlled finance data and never change records from chat.',
    };
  }

  private async safeExplanation(fullyExplained: boolean) {
    const fallback = fullyExplained
      ? 'The documented settlement adjustments account for the result.'
      : 'The remaining variance should be reviewed with the supporting records.';
    try {
      const response = (
        await this.ai.complete({
          system:
            'You are a finance operations assistant. Reply with one concise sentence and no numbers, amounts, currencies, identifiers, calculations, or new facts.',
          prompt: fullyExplained
            ? 'Explain qualitatively that documented settlement adjustments account for the result.'
            : 'Explain qualitatively that a remaining settlement variance needs human review.',
        })
      )
        .replace(/\s+/g, ' ')
        .trim();
      return response.length > 0 && response.length <= 280 && !/[0-9₹$]/.test(response)
        ? response
        : fallback;
    } catch {
      return fallback;
    }
  }
}
