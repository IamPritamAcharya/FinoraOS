import type { ReconciliationRecord } from '../types.js';
import { sameAmount } from './exact-reference.matcher.js';

const day = (value: string) => {
  const [year, month, date] = value.slice(0, 10).split('-').map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
};

export const daysApart = (left: ReconciliationRecord, right: ReconciliationRecord) =>
  Math.abs(day(left.occurredOn) - day(right.occurredOn));

export const dateWindowCandidates = (
  left: ReconciliationRecord,
  rights: ReconciliationRecord[],
  dateWindowDays: number,
) => rights.filter((right) => sameAmount(left, right) && daysApart(left, right) <= dateWindowDays);
