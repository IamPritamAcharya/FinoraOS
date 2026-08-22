import type { ReconciliationRecord } from '../types.js';
import { sameAmount } from './exact-reference.matcher.js';

export const settlementCandidates = (left: ReconciliationRecord, rights: ReconciliationRecord[]) =>
  left.settlementReference
    ? rights.filter(
        (right) =>
          right.settlementReference === left.settlementReference && sameAmount(left, right),
      )
    : [];
