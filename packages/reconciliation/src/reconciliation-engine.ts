import { compositeScore } from './matchers/composite-score.matcher.js';
import { dateWindowCandidates, daysApart } from './matchers/date-window.matcher.js';
import { exactReferenceCandidates, sameAmount } from './matchers/exact-reference.matcher.js';
import { settlementCandidates } from './matchers/settlement.matcher.js';
import type {
  ExceptionKind,
  MatchMethod,
  ReconciliationConfig,
  ReconciliationException,
  ReconciliationMatch,
  ReconciliationMetrics,
  ReconciliationRecord,
  ReconciliationResult,
} from './types.js';

export const defaultReconciliationConfig: ReconciliationConfig = {
  dateWindowDays: 2,
  compositeThreshold: 0.75,
  compositeAmountWeight: 0.55,
  compositeDateWeight: 0.25,
  compositeDescriptionWeight: 0.2,
};

const ordered = (records: ReconciliationRecord[]) =>
  [...records].sort((a, b) => a.id.localeCompare(b.id));

const metricsFor = (
  matches: ReconciliationMatch[],
  exceptions: ReconciliationException[],
  recordsProcessed: number,
): ReconciliationMetrics => {
  const countMethod = (method: MatchMethod) =>
    matches.filter((match) => match.method === method).length;
  const countException = (kind: ExceptionKind) =>
    exceptions.filter((exception) => exception.kind === kind).length;
  return {
    recordsProcessed,
    matched: matches.length,
    exceptions: exceptions.length,
    exactReferenceMatches: countMethod('EXACT_REFERENCE'),
    settlementRelationshipMatches: countMethod('SETTLEMENT_RELATIONSHIP'),
    dateWindowMatches: countMethod('DATE_WINDOW'),
    compositeScoreMatches: countMethod('COMPOSITE_SCORE'),
    ambiguousExceptions: countException('AMBIGUOUS_MATCH'),
    amountMismatchExceptions: countException('AMOUNT_MISMATCH'),
    missingCounterpartExceptions: countException('MISSING_COUNTERPART'),
    lowConfidenceExceptions: countException('LOW_CONFIDENCE'),
  };
};

const exception = (
  left: ReconciliationRecord,
  kind: ExceptionKind,
  candidates: ReconciliationRecord[],
  reason: string,
  confidence: number,
): ReconciliationException => ({
  key: `${kind}:${left.id}`,
  kind,
  leftRecordId: left.id,
  candidateRecordIds: candidates.map((candidate) => candidate.id).sort(),
  expectedAmount: left.amount,
  receivedAmount: candidates[0]?.amount ?? '0.00',
  confidence,
  reason,
  evidence: {
    reference: left.reference ?? '',
    settlementReference: left.settlementReference ?? '',
    candidateCount: candidates.length,
  },
});

const match = (
  left: ReconciliationRecord,
  right: ReconciliationRecord,
  method: MatchMethod,
  confidence: number,
  reason: string,
): ReconciliationMatch => ({
  leftRecordId: left.id,
  rightRecordId: right.id,
  method,
  confidence,
  reason,
  evidence: {
    leftReference: left.reference ?? '',
    rightReference: right.reference ?? '',
    amount: left.amount,
    currency: left.currency,
    dateDistanceDays: daysApart(left, right),
    settlementReference: left.settlementReference ?? '',
  },
});

/**
 * Reconciles two explicit record sets. Inputs are never mutated, and a right-side
 * record can be consumed at most once. Ambiguity always produces an exception.
 */
export const runReconciliation = (
  leftRecords: ReconciliationRecord[],
  rightRecords: ReconciliationRecord[],
  overrides: Partial<ReconciliationConfig> = {},
): ReconciliationResult => {
  const config = { ...defaultReconciliationConfig, ...overrides };
  const lefts = ordered(leftRecords);
  const rights = ordered(rightRecords);
  const consumed = new Set<string>();
  const matches: ReconciliationMatch[] = [];
  const exceptions: ReconciliationException[] = [];

  for (const left of lefts) {
    const available = rights.filter((right) => !consumed.has(right.id));
    const exactReference = exactReferenceCandidates(left, available);
    const exactAmount = exactReference.filter((right) => sameAmount(left, right));

    if (exactAmount.length === 1) {
      const right = exactAmount[0];
      consumed.add(right.id);
      matches.push(
        match(left, right, 'EXACT_REFERENCE', 1, 'Exact reference, amount and currency match.'),
      );
      continue;
    }
    if (exactAmount.length > 1) {
      exceptions.push(
        exception(
          left,
          'AMBIGUOUS_MATCH',
          exactAmount,
          'Duplicate exact-reference counterparts require review.',
          0.5,
        ),
      );
      continue;
    }
    if (exactReference.length > 0) {
      exceptions.push(
        exception(
          left,
          'AMOUNT_MISMATCH',
          exactReference,
          'Reference matched but the recorded amount differs.',
          0.15,
        ),
      );
      continue;
    }

    const settlement = settlementCandidates(left, available);
    if (settlement.length === 1) {
      const right = settlement[0];
      consumed.add(right.id);
      matches.push(
        match(
          left,
          right,
          'SETTLEMENT_RELATIONSHIP',
          0.98,
          'Known settlement relationship and amount match.',
        ),
      );
      continue;
    }
    if (settlement.length > 1) {
      exceptions.push(
        exception(
          left,
          'AMBIGUOUS_MATCH',
          settlement,
          'Multiple settlement-related counterparts are eligible.',
          0.55,
        ),
      );
      continue;
    }

    const dateCandidates = dateWindowCandidates(left, available, config.dateWindowDays);
    if (dateCandidates.length === 1) {
      const right = dateCandidates[0];
      consumed.add(right.id);
      matches.push(
        match(left, right, 'DATE_WINDOW', 0.9, 'Exact amount within the configured date window.'),
      );
      continue;
    }
    if (dateCandidates.length > 1) {
      exceptions.push(
        exception(
          left,
          'AMBIGUOUS_MATCH',
          dateCandidates,
          'Multiple same-amount records fall within the date window.',
          0.5,
        ),
      );
      continue;
    }

    const scored = available
      .map((right) => ({ right, score: compositeScore(left, right, config) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.right.id.localeCompare(b.right.id));
    const best = scored[0];
    const tied = best ? scored.filter((candidate) => candidate.score === best.score) : [];
    if (best && best.score >= config.compositeThreshold && tied.length === 1) {
      consumed.add(best.right.id);
      matches.push(
        match(
          left,
          best.right,
          'COMPOSITE_SCORE',
          best.score,
          'Deterministic composite score exceeded the configured threshold.',
        ),
      );
      continue;
    }
    if (best && best.score >= config.compositeThreshold) {
      exceptions.push(
        exception(
          left,
          'AMBIGUOUS_MATCH',
          tied.map((candidate) => candidate.right),
          'Top composite candidates are tied.',
          best.score,
        ),
      );
      continue;
    }
    if (best) {
      exceptions.push(
        exception(
          left,
          'LOW_CONFIDENCE',
          [best.right],
          'Best deterministic candidate is below the auto-match threshold.',
          best.score,
        ),
      );
      continue;
    }
    exceptions.push(
      exception(left, 'MISSING_COUNTERPART', [], 'No eligible counterpart record was found.', 0),
    );
  }

  return {
    matches,
    exceptions,
    metrics: metricsFor(matches, exceptions, lefts.length + rights.length),
  };
};
