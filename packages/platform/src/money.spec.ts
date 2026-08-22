import { describe, expect, it } from 'vitest';
import { money } from './money.js';
describe('money', () => {
  it('does not introduce floating point drift', () => {
    expect(money('0.10').plus('0.20').toFixed(2)).toBe('0.30');
  });
});
