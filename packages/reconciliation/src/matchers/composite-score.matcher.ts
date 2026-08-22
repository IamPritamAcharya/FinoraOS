import type { ReconciliationConfig, ReconciliationRecord } from '../types.js';
import { daysApart } from './date-window.matcher.js';
import { sameAmount } from './exact-reference.matcher.js';

const words = (value: string | null | undefined) =>
  new Set(
    (value ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  );

const overlap = (left: Set<string>, right: Set<string>) => {
  if (!left.size || !right.size) return 0;
  const common = [...left].filter((word) => right.has(word)).length;
  return common / Math.max(left.size, right.size);
};

export const compositeScore = (
  left: ReconciliationRecord,
  right: ReconciliationRecord,
  config: ReconciliationConfig,
) => {
  if (!sameAmount(left, right)) return 0;
  const dateScore = Math.max(0, 1 - daysApart(left, right) / (config.dateWindowDays + 1));
  const descriptionScore = overlap(words(left.description), words(right.description));
  return Number(
    (
      config.compositeAmountWeight +
      dateScore * config.compositeDateWeight +
      descriptionScore * config.compositeDescriptionWeight
    ).toFixed(3),
  );
};
