import { Decimal } from 'decimal.js';
import type {
  CategoryLimitWarning,
  LimitValidationInput,
  PolicyEvaluation,
  SpendEvaluationInput,
  SpendLimitInput,
  SpendPolicyViolation,
} from './types.js';

const money = (value: Decimal.Value) => new Decimal(value).toFixed(2);

function sameWindow(left: SpendLimitInput, right: SpendLimitInput) {
  return left.periodStart === right.periodStart && left.periodEnd === right.periodEnd;
}

function ancestors(nodeId: string, limits: SpendLimitInput[]) {
  const byNode = new Map(limits.map((limit) => [limit.nodeId, limit]));
  const result: SpendLimitInput[] = [];
  const visited = new Set<string>();
  let current = byNode.get(nodeId);
  while (current && !visited.has(current.nodeId)) {
    result.push(current);
    visited.add(current.nodeId);
    current = current.parentNodeId ? byNode.get(current.parentNodeId) : undefined;
  }
  return result;
}

function descendants(nodeId: string, limits: SpendLimitInput[]) {
  const result = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const limit of limits) {
      if (limit.parentNodeId && result.has(limit.parentNodeId) && !result.has(limit.nodeId)) {
        result.add(limit.nodeId);
        changed = true;
      }
    }
  }
  return result;
}

function usedAmount(
  limit: SpendLimitInput,
  limits: SpendLimitInput[],
  spend: LimitValidationInput['spend'],
) {
  const nodeIds = descendants(limit.nodeId, limits);
  return spend
    .filter((item) => item.currency === limit.currency && nodeIds.has(item.nodeId))
    .reduce((total, item) => total.plus(item.amount), new Decimal(0));
}

export function validateSpendLimit(input: LimitValidationInput): PolicyEvaluation {
  const proposed = input.proposed;
  const limits = [...input.limits.filter((limit) => limit.id !== proposed.id), proposed];
  const violations: SpendPolicyViolation[] = [];
  let amount: Decimal;
  try {
    amount = new Decimal(proposed.amount);
    if (!amount.isPositive()) throw new Error('not positive');
  } catch {
    return {
      allowed: false,
      warnings: [],
      violations: [
        {
          code: 'INVALID_AMOUNT',
          nodeId: proposed.nodeId,
          message: 'Spend limit must be greater than zero.',
        },
      ],
    };
  }
  if (proposed.periodStart >= proposed.periodEnd) {
    violations.push({
      code: 'INVALID_PERIOD',
      nodeId: proposed.nodeId,
      limitId: proposed.id,
      message: 'The limit end date must be after its start date.',
    });
  }
  const parent = proposed.parentNodeId
    ? limits.find((limit) => limit.nodeId === proposed.parentNodeId)
    : undefined;
  if (proposed.parentNodeId && !parent) {
    violations.push({
      code: 'PARENT_LIMIT_REQUIRED',
      nodeId: proposed.nodeId,
      limitId: proposed.id,
      message: 'Set a limit on the parent node before limiting this node.',
    });
  }
  if (parent) {
    if (!sameWindow(proposed, parent)) {
      violations.push({
        code: 'PERIOD_MISMATCH',
        nodeId: proposed.nodeId,
        limitId: proposed.id,
        message: 'Child and parent limits must use the same period.',
      });
    }
    if (proposed.currency !== parent.currency) {
      violations.push({
        code: 'CURRENCY_MISMATCH',
        nodeId: proposed.nodeId,
        limitId: proposed.id,
        message: 'Child and parent limits must use the same currency.',
      });
    }
    if (amount.greaterThan(parent.amount)) {
      violations.push({
        code: 'CHILD_EXCEEDS_PARENT',
        nodeId: proposed.nodeId,
        limitId: proposed.id,
        amount: money(amount),
        message: `This node cannot exceed its parent limit of ${money(parent.amount)} ${parent.currency}.`,
      });
    }
  }
  const childTotal = limits
    .filter(
      (limit) =>
        limit.parentNodeId === proposed.nodeId &&
        sameWindow(limit, proposed) &&
        limit.currency === proposed.currency,
    )
    .reduce((total, limit) => total.plus(limit.amount), new Decimal(0));
  if (childTotal.greaterThan(amount)) {
    violations.push({
      code: 'CHILDREN_EXCEED_PARENT',
      nodeId: proposed.nodeId,
      limitId: proposed.id,
      amount: money(childTotal),
      message: `Direct child allocations total ${money(childTotal)} ${proposed.currency}, above this limit.`,
    });
  }
  const categoryTotal = proposed.categoryLimits.reduce(
    (total, category) => total.plus(category.amount),
    new Decimal(0),
  );
  if (categoryTotal.greaterThan(amount)) {
    violations.push({
      code: 'CATEGORY_EXCEEDS_HARD_LIMIT',
      nodeId: proposed.nodeId,
      limitId: proposed.id,
      amount: money(categoryTotal),
      message: 'Category limits together cannot exceed the node hard limit.',
    });
  }
  const currentSpend = usedAmount(proposed, limits, input.spend);
  if (currentSpend.greaterThan(amount)) {
    violations.push({
      code: 'CURRENT_SPEND_EXCEEDS_LIMIT',
      nodeId: proposed.nodeId,
      limitId: proposed.id,
      amount: money(currentSpend),
      message: `This limit cannot be below the current subtree spend of ${money(currentSpend)} ${proposed.currency}.`,
    });
  }
  return { allowed: violations.length === 0, violations, warnings: [] };
}

export function evaluateSpend(input: SpendEvaluationInput): PolicyEvaluation {
  const violations: SpendPolicyViolation[] = [];
  const warnings: CategoryLimitWarning[] = [];
  let amount: Decimal;
  try {
    amount = new Decimal(input.amount);
    if (!amount.isPositive()) throw new Error('not positive');
  } catch {
    return {
      allowed: false,
      warnings,
      violations: [
        {
          code: 'INVALID_AMOUNT',
          nodeId: input.nodeId,
          message: 'Spend amount must be greater than zero.',
        },
      ],
    };
  }
  for (const limit of ancestors(input.nodeId, input.limits)) {
    if (limit.currency !== input.currency) continue;
    const subtree = descendants(limit.nodeId, input.limits);
    const current = input.spend
      .filter((item) => item.currency === input.currency && subtree.has(item.nodeId))
      .reduce((total, item) => total.plus(item.amount), new Decimal(0));
    const projected = current.plus(amount);
    if (projected.greaterThan(limit.amount)) {
      violations.push({
        code: 'HARD_LIMIT_EXCEEDED',
        nodeId: limit.nodeId,
        limitId: limit.id,
        amount: money(projected.minus(limit.amount)),
        message: `This spend would exceed the hard limit by ${money(projected.minus(limit.amount))} ${input.currency}.`,
      });
    }
    const categoryLimit = limit.categoryLimits.find((item) => item.category === input.category);
    if (!categoryLimit) continue;
    const categoryCurrent = input.spend
      .filter(
        (item) =>
          item.currency === input.currency &&
          item.category === input.category &&
          subtree.has(item.nodeId),
      )
      .reduce((total, item) => total.plus(item.amount), new Decimal(0));
    const categoryProjected = categoryCurrent.plus(amount);
    if (categoryProjected.greaterThan(categoryLimit.amount)) {
      warnings.push({
        code: 'CATEGORY_LIMIT_EXCEEDED',
        nodeId: limit.nodeId,
        limitId: limit.id,
        category: input.category,
        limitAmount: money(categoryLimit.amount),
        projectedAmount: money(categoryProjected),
        overBy: money(categoryProjected.minus(categoryLimit.amount)),
        message: `${input.category.replaceAll('_', ' ')} is ${money(categoryProjected.minus(categoryLimit.amount))} ${input.currency} above its soft limit.`,
      });
    }
  }
  return { allowed: violations.length === 0, violations, warnings };
}
