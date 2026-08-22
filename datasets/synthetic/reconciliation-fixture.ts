import type { ReconciliationRecord } from '@finora/reconciliation';

export type SyntheticReconciliationDataset = {
  leftRecords: ReconciliationRecord[];
  rightRecords: ReconciliationRecord[];
  expectedMatchPairs: string[];
  expectedExceptionLeftRecordIds: string[];
};

const date = (day: number) => `2026-08-${String(day).padStart(2, '0')}`;

export const syntheticReconciliationDataset = (): SyntheticReconciliationDataset => {
  const leftRecords: ReconciliationRecord[] = [];
  const rightRecords: ReconciliationRecord[] = [];
  const expectedMatchPairs: string[] = [];
  const expectedExceptionLeftRecordIds: string[] = [];

  for (let index = 1; index <= 120; index += 1) {
    const id = `payment-${index}`;
    const amount = (10_000 + index * 37).toFixed(2);
    const category =
      index <= 94
        ? 'exact'
        : index <= 100
          ? 'settlement'
          : index <= 104
            ? 'date'
            : index <= 108
              ? 'composite'
              : index <= 112
                ? 'ambiguous'
                : index <= 116
                  ? 'missing'
                  : 'amountMismatch';
    const left: ReconciliationRecord = {
      id,
      source: 'PAYMENT',
      reference: category === 'exact' || category === 'amountMismatch' ? `REF-${index}` : undefined,
      amount,
      currency: 'INR',
      occurredOn: date((index % 12) + 1),
      settlementReference: category === 'settlement' ? `STL-${index}` : undefined,
      description: `payment order ${index}`,
    };
    leftRecords.push(left);
    if (category === 'missing') {
      expectedExceptionLeftRecordIds.push(id);
      continue;
    }
    const right: ReconciliationRecord = {
      id: `bank-${index}`,
      source: 'BANK_STATEMENT',
      reference: left.reference,
      amount: category === 'amountMismatch' ? (Number(amount) + 100).toFixed(2) : amount,
      currency: 'INR',
      occurredOn: date((index % 12) + (category === 'date' ? 2 : category === 'composite' ? 4 : 1)),
      settlementReference: left.settlementReference,
      description: `payment order ${index}`,
    };
    if (category === 'date' || category === 'composite' || category === 'ambiguous') {
      right.reference = undefined;
    }
    if (category === 'ambiguous') {
      rightRecords.push(right, { ...right, id: `${right.id}-duplicate` });
      expectedExceptionLeftRecordIds.push(id);
    } else {
      rightRecords.push(right);
      if (category !== 'amountMismatch') expectedMatchPairs.push(`${id}:${right.id}`);
      else expectedExceptionLeftRecordIds.push(id);
    }
  }
  return { leftRecords, rightRecords, expectedMatchPairs, expectedExceptionLeftRecordIds };
};
