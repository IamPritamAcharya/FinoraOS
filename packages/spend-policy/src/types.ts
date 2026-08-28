export type MoneyInput = string;

export interface CategoryLimitInput {
  category: string;
  amount: MoneyInput;
}

export interface SpendLimitInput {
  id: string;
  nodeId: string;
  parentNodeId: string | null;
  amount: MoneyInput;
  currency: string;
  periodStart: string;
  periodEnd: string;
  categoryLimits: CategoryLimitInput[];
}

export interface NodeSpendInput {
  nodeId: string;
  amount: MoneyInput;
  currency: string;
  category: string;
}

export interface SpendPolicyViolation {
  code:
    | 'INVALID_AMOUNT'
    | 'INVALID_PERIOD'
    | 'PARENT_LIMIT_REQUIRED'
    | 'PERIOD_MISMATCH'
    | 'CURRENCY_MISMATCH'
    | 'CHILD_EXCEEDS_PARENT'
    | 'CHILDREN_EXCEED_PARENT'
    | 'CATEGORY_EXCEEDS_HARD_LIMIT'
    | 'CURRENT_SPEND_EXCEEDS_LIMIT'
    | 'HARD_LIMIT_EXCEEDED';
  message: string;
  nodeId: string;
  limitId?: string;
  amount?: MoneyInput;
}

export interface CategoryLimitWarning {
  code: 'CATEGORY_LIMIT_EXCEEDED';
  nodeId: string;
  limitId: string;
  category: string;
  limitAmount: MoneyInput;
  projectedAmount: MoneyInput;
  overBy: MoneyInput;
  message: string;
}

export interface PolicyEvaluation {
  allowed: boolean;
  violations: SpendPolicyViolation[];
  warnings: CategoryLimitWarning[];
}

export interface LimitValidationInput {
  proposed: SpendLimitInput;
  limits: SpendLimitInput[];
  spend: NodeSpendInput[];
}

export interface SpendEvaluationInput {
  nodeId: string;
  amount: MoneyInput;
  currency: string;
  category: string;
  limits: SpendLimitInput[];
  spend: NodeSpendInput[];
}
