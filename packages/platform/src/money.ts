import { Decimal } from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const money = (value: string | number | Decimal) => new Decimal(value);

export const formatInr = (amount: string | number | Decimal, compact = false) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(money(amount).toNumber());
