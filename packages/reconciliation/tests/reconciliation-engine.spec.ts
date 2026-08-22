import { describe, expect, it } from 'vitest';
import { runReconciliation, type ReconciliationRecord } from '../src/index.js';

const record = (
  id: string,
  overrides: Partial<ReconciliationRecord> = {},
): ReconciliationRecord => ({
  id,
  source: id.startsWith('bank') ? 'BANK' : 'PAYMENT',
  reference: `REF-${id}`,
  amount: '100.00',
  currency: 'INR',
  occurredOn: '2026-08-10',
  description: `payment ${id}`,
  ...overrides,
});

describe('runReconciliation', () => {
  it('matches an exact reference safely', () => {
    const result = runReconciliation(
      [record('payment-1', { reference: 'R1' })],
      [record('bank-1', { reference: 'R1' })],
    );
    expect(result.matches[0]).toMatchObject({ method: 'EXACT_REFERENCE', confidence: 1 });
  });

  it('matches known settlement relationships when references are absent', () => {
    const result = runReconciliation(
      [record('payment-1', { reference: undefined, settlementReference: 'STL-1' })],
      [record('bank-1', { reference: undefined, settlementReference: 'STL-1' })],
    );
    expect(result.matches[0]?.method).toBe('SETTLEMENT_RELATIONSHIP');
  });

  it('matches a unique same-amount counterpart within the date window', () => {
    const result = runReconciliation(
      [record('payment-1', { reference: undefined, occurredOn: '2026-08-10' })],
      [record('bank-1', { reference: undefined, occurredOn: '2026-08-12' })],
    );
    expect(result.matches[0]?.method).toBe('DATE_WINDOW');
  });

  it('matches a high-confidence composite candidate after the date window', () => {
    const result = runReconciliation(
      [
        record('payment-1', {
          reference: undefined,
          occurredOn: '2026-08-10',
          description: 'payment invoice alpha',
        }),
      ],
      [
        record('bank-1', {
          reference: undefined,
          occurredOn: '2026-08-13',
          description: 'payment invoice alpha',
        }),
      ],
    );
    expect(result.matches[0]).toMatchObject({ method: 'COMPOSITE_SCORE', confidence: 0.75 });
  });

  it('emits an amount-mismatch exception for an exact reference with a different amount', () => {
    const result = runReconciliation(
      [record('payment-1', { reference: 'R1' })],
      [record('bank-1', { reference: 'R1', amount: '101.00' })],
    );
    expect(result.exceptions[0]?.kind).toBe('AMOUNT_MISMATCH');
  });

  it('does not auto-match duplicate references', () => {
    const result = runReconciliation(
      [record('payment-1', { reference: 'R1' })],
      [record('bank-1', { reference: 'R1' }), record('bank-2', { reference: 'R1' })],
    );
    expect(result.exceptions[0]).toMatchObject({
      kind: 'AMBIGUOUS_MATCH',
      candidateRecordIds: ['bank-1', 'bank-2'],
    });
  });

  it('emits missing-counterpart exceptions for missing references and records', () => {
    const result = runReconciliation([record('payment-1', { reference: undefined })], []);
    expect(result.exceptions[0]?.kind).toBe('MISSING_COUNTERPART');
  });

  it('treats a boundary date as eligible', () => {
    const result = runReconciliation(
      [record('payment-1', { reference: undefined, occurredOn: '2026-08-10' })],
      [record('bank-1', { reference: undefined, occurredOn: '2026-08-12' })],
      { dateWindowDays: 2 },
    );
    expect(result.matches).toHaveLength(1);
  });

  it('returns zeroed metrics for empty input', () => {
    expect(runReconciliation([], []).metrics).toMatchObject({
      recordsProcessed: 0,
      matched: 0,
      exceptions: 0,
    });
  });

  it('never consumes a counterpart more than once', () => {
    const result = runReconciliation(
      [record('payment-1', { reference: 'R1' }), record('payment-2', { reference: 'R1' })],
      [record('bank-1', { reference: 'R1' })],
    );
    expect(result.matches).toHaveLength(1);
    expect(result.exceptions[0]?.kind).toBe('MISSING_COUNTERPART');
  });

  it('keeps low confidence candidates unresolved', () => {
    const result = runReconciliation(
      [
        record('payment-1', {
          reference: undefined,
          occurredOn: '2026-08-10',
          description: 'payment alpha',
        }),
      ],
      [
        record('bank-1', {
          reference: undefined,
          occurredOn: '2026-08-14',
          description: 'different beta',
        }),
      ],
    );
    expect(result.exceptions[0]?.kind).toBe('LOW_CONFIDENCE');
  });

  it('is repeatable for identical input', () => {
    const left = [
      record('payment-2', { reference: 'R2' }),
      record('payment-1', { reference: 'R1' }),
    ];
    const right = [record('bank-1', { reference: 'R1' }), record('bank-2', { reference: 'R2' })];
    expect(runReconciliation(left, right)).toEqual(runReconciliation(left, right));
  });

  it('reports metrics from actual match and exception output', () => {
    const result = runReconciliation(
      [record('payment-1', { reference: 'R1' }), record('payment-2', { reference: 'R2' })],
      [
        record('bank-1', { reference: 'R1' }),
        record('bank-2', { reference: 'R2', amount: '105.00' }),
      ],
    );
    expect(result.metrics).toMatchObject({
      recordsProcessed: 4,
      matched: 1,
      exceptions: 1,
      exactReferenceMatches: 1,
      amountMismatchExceptions: 1,
    });
  });
});
