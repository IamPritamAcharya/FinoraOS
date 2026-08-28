import { describe, expect, it } from 'vitest';
import { evaluateSpend, validateSpendLimit, type SpendLimitInput } from '../src/index.js';

const root: SpendLimitInput = {
  id: 'root-limit',
  nodeId: 'root',
  parentNodeId: null,
  amount: '1000.00',
  currency: 'INR',
  periodStart: '2026-08-01',
  periodEnd: '2026-09-01',
  categoryLimits: [{ category: 'TRAVEL', amount: '300.00' }],
};
const child: SpendLimitInput = {
  ...root,
  id: 'child-limit',
  nodeId: 'child',
  parentNodeId: 'root',
  amount: '400.00',
  categoryLimits: [{ category: 'TRAVEL', amount: '100.00' }],
};

describe('spend limit engine', () => {
  it('accepts a valid root limit', () =>
    expect(validateSpendLimit({ proposed: root, limits: [], spend: [] }).allowed).toBe(true));
  it('requires a parent limit', () =>
    expect(validateSpendLimit({ proposed: child, limits: [], spend: [] }).violations[0]?.code).toBe(
      'PARENT_LIMIT_REQUIRED',
    ));
  it('rejects a child above its parent', () =>
    expect(
      validateSpendLimit({
        proposed: { ...child, amount: '1001' },
        limits: [root],
        spend: [],
      }).violations.some((v) => v.code === 'CHILD_EXCEEDS_PARENT'),
    ).toBe(true));
  it('rejects sibling allocations above the parent', () => {
    const sibling = { ...child, id: 'sibling-limit', nodeId: 'sibling', amount: '700.00' };
    expect(
      validateSpendLimit({ proposed: root, limits: [child, sibling], spend: [] }).violations.some(
        (v) => v.code === 'CHILDREN_EXCEED_PARENT',
      ),
    ).toBe(true);
  });
  it('rejects category allocations above the hard limit', () =>
    expect(
      validateSpendLimit({
        proposed: { ...root, categoryLimits: [{ category: 'TRAVEL', amount: '1001' }] },
        limits: [],
        spend: [],
      }).violations.some((v) => v.code === 'CATEGORY_EXCEEDS_HARD_LIMIT'),
    ).toBe(true));
  it('does not allow lowering a limit below current subtree spend', () =>
    expect(
      validateSpendLimit({
        proposed: { ...root, amount: '99' },
        limits: [child],
        spend: [{ nodeId: 'child', amount: '100', currency: 'INR', category: 'TRAVEL' }],
      }).violations.some((v) => v.code === 'CURRENT_SPEND_EXCEEDS_LIMIT'),
    ).toBe(true));
  it('allows spend exactly at the hard limit', () =>
    expect(
      evaluateSpend({
        nodeId: 'child',
        amount: '400',
        currency: 'INR',
        category: 'OTHER',
        limits: [root, child],
        spend: [{ nodeId: 'root', amount: '600', currency: 'INR', category: 'OTHER' }],
      }).allowed,
    ).toBe(true));
  it('blocks ancestor hard-limit excess', () =>
    expect(
      evaluateSpend({
        nodeId: 'child',
        amount: '601',
        currency: 'INR',
        category: 'OTHER',
        limits: [root, child],
        spend: [{ nodeId: 'root', amount: '400', currency: 'INR', category: 'OTHER' }],
      }).violations.some((v) => v.code === 'HARD_LIMIT_EXCEEDED'),
    ).toBe(true));
  it('warns but permits a category-limit excess', () => {
    const result = evaluateSpend({
      nodeId: 'child',
      amount: '51',
      currency: 'INR',
      category: 'TRAVEL',
      limits: [root, child],
      spend: [{ nodeId: 'child', amount: '50', currency: 'INR', category: 'TRAVEL' }],
    });
    expect(result.allowed).toBe(true);
    expect(result.warnings[0]?.code).toBe('CATEGORY_LIMIT_EXCEEDED');
  });
  it('is repeatable', () => {
    const input = {
      nodeId: 'child',
      amount: '51',
      currency: 'INR',
      category: 'TRAVEL',
      limits: [root, child],
      spend: [],
    };
    expect(evaluateSpend(input)).toEqual(evaluateSpend(input));
  });
});
