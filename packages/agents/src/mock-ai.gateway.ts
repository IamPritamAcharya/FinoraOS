import { formatInr } from '@finora/platform';
import type { AiGateway, SettlementEvidence } from './types.js';

export class MockAiGateway implements AiGateway {
  async explainSettlement(evidence: SettlementEvidence): Promise<string> {
    return `Settlement ${evidence.settlementId} is explained by gateway fees of ${formatInr(evidence.gatewayFees)}, GST of ${formatInr(evidence.gstOnFees)}, and refunds of ${formatInr(evidence.refunds)}. The result is grounded in the attached settlement evidence.`;
  }
}
