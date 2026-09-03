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

export type SettlementExplanationInput = {
  settlementId: string;
  fullyExplained: boolean;
};

export interface AiGateway {
  explainSettlement(input: SettlementExplanationInput): Promise<string>;
}

export type InvestigationResult = ExceptionResolution & {
  explanation: string;
  evidence?: SettlementEvidence & {
    difference: string;
    explainedAmount: string;
    unexplainedAmount: string;
  };
};
