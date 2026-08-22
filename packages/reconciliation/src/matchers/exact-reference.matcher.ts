import { Decimal } from 'decimal.js';
import type { ReconciliationRecord } from '../types.js';

export const sameAmount = (left: ReconciliationRecord, right: ReconciliationRecord) =>
  left.currency === right.currency && new Decimal(left.amount).equals(new Decimal(right.amount));

export const exactReferenceCandidates = (
  left: ReconciliationRecord,
  rights: ReconciliationRecord[],
) =>
  left.reference
    ? rights.filter(
        (right) => right.reference === left.reference && right.currency === left.currency,
      )
    : [];
