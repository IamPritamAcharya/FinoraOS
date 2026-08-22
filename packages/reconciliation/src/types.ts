export type ReconciliationRecord = {
  id: string;
  source: string;
  reference?: string | null;
  amount: string;
  currency: string;
  occurredOn: string;
  settlementReference?: string | null;
  description?: string | null;
};

export type MatchMethod =
  | 'EXACT_REFERENCE'
  | 'SETTLEMENT_RELATIONSHIP'
  | 'DATE_WINDOW'
  | 'COMPOSITE_SCORE';
export type ExceptionKind =
  | 'AMBIGUOUS_MATCH'
  | 'AMOUNT_MISMATCH'
  | 'MISSING_COUNTERPART'
  | 'LOW_CONFIDENCE';

export type ReconciliationConfig = {
  dateWindowDays: number;
  compositeThreshold: number;
  compositeDateWeight: number;
  compositeDescriptionWeight: number;
  compositeAmountWeight: number;
};

export type ReconciliationMatch = {
  leftRecordId: string;
  rightRecordId: string;
  method: MatchMethod;
  confidence: number;
  reason: string;
  evidence: Record<string, string | number | boolean>;
};

export type ReconciliationException = {
  key: string;
  kind: ExceptionKind;
  leftRecordId: string;
  candidateRecordIds: string[];
  expectedAmount: string;
  receivedAmount: string;
  confidence: number;
  reason: string;
  evidence: Record<string, string | number | boolean>;
};

export type ReconciliationMetrics = {
  recordsProcessed: number;
  matched: number;
  exceptions: number;
  exactReferenceMatches: number;
  settlementRelationshipMatches: number;
  dateWindowMatches: number;
  compositeScoreMatches: number;
  ambiguousExceptions: number;
  amountMismatchExceptions: number;
  missingCounterpartExceptions: number;
  lowConfidenceExceptions: number;
};

export type ReconciliationResult = {
  matches: ReconciliationMatch[];
  exceptions: ReconciliationException[];
  metrics: ReconciliationMetrics;
};
