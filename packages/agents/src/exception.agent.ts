import { ExceptionResolutionSchema, ExceptionStatus, ExceptionType, money } from '@finora/platform';
import type { AiGateway, FinanceTools, InvestigationResult } from './types.js';

export class ExceptionInvestigator {
  constructor(
    private readonly tools: FinanceTools,
    private readonly ai: AiGateway,
  ) {}

  async investigate(exceptionId: string): Promise<InvestigationResult> {
    const evidence = await this.tools.getSettlementEvidence(exceptionId);
    if (!evidence) {
      return {
        exceptionId,
        type: ExceptionType.MISSING_BANK_RECORD,
        status: ExceptionStatus.NEEDS_REVIEW,
        confidence: 0.2,
        reason: 'No settlement evidence was available for a safe automated decision.',
        proposedActions: [{ type: 'REQUEST_HUMAN_REVIEW', requiresApproval: true, payload: {} }],
        explanation:
          'This exception needs a finance review because its supporting records are incomplete.',
      };
    }
    const difference = money(evidence.expectedAmount).minus(evidence.receivedAmount);
    const explained = money(evidence.gatewayFees).plus(evidence.gstOnFees).plus(evidence.refunds);
    const resolved = difference.equals(explained);
    const resolution = ExceptionResolutionSchema.parse({
      exceptionId,
      type: ExceptionType.SETTLEMENT_MISMATCH,
      status: resolved ? ExceptionStatus.PROPOSED : ExceptionStatus.NEEDS_REVIEW,
      confidence: resolved ? 0.97 : 0.45,
      reason: resolved
        ? 'The settlement difference exactly equals fees, GST and refunds.'
        : 'The settlement difference is not fully explained by known adjustments.',
      proposedActions: [
        resolved
          ? {
              type: 'CREATE_SETTLEMENT_FEE_ADJUSTMENT',
              requiresApproval: true,
              payload: { settlementId: evidence.settlementId },
            }
          : {
              type: 'REQUEST_HUMAN_REVIEW',
              requiresApproval: true,
              payload: { settlementId: evidence.settlementId },
            },
      ],
    });
    return {
      ...resolution,
      explanation: await this.ai.explainSettlement({
        settlementId: evidence.settlementId,
        fullyExplained: resolved,
      }),
    };
  }
}
