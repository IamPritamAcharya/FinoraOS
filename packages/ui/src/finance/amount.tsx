import { formatInr } from '@finora/platform';

export function Amount({ value, compact = false }: { value: string | number; compact?: boolean }) {
  return <span className="finora-amount">{formatInr(value, compact)}</span>;
}
