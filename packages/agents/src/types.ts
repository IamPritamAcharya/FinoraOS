import type { ExceptionResolution } from '@finora/platform';

export type SettlementEvidence = {
  settlementId: string;
  expectedAmount: string;
  receivedAmount: string;
  gatewayFees: string;
  gstOnFees: string;
  refunds: string;
};

export interface FinanceTools {
  getSettlementEvidence(exceptionId: string): Promise<SettlementEvidence | null>;
}

export interface AiGateway {
  explainSettlement(evidence: SettlementEvidence): Promise<string>;
}

export type InvestigationResult = ExceptionResolution & { explanation: string };
