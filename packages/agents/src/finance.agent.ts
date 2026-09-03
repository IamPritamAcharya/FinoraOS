import { z } from 'zod';

export type FinanceChatContext = { role: 'user' | 'assistant'; text: string };
export type FinanceSkillContext = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  allowedTools: FinanceToolName[];
};

const decimal = z
  .union([z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().finite().nonnegative()])
  .transform((value) => String(value));
const optionalLimit = z.number().int().min(1).max(100).optional();
const dateInput = (endOfDay = false) =>
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Use a valid date')
    .transform((value) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
      }
      return new Date(value).toISOString();
    });
const optionalPeriod = {
  from: dateInput().optional(),
  to: dateInput(true).optional(),
};
const normalizeAmountFilter = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const range =
    input.amountRange && typeof input.amountRange === 'object'
      ? (input.amountRange as Record<string, unknown>)
      : {};
  return {
    ...input,
    minimumAmount:
      input.minimumAmount ??
      input.minAmount ??
      input.minimum_amount ??
      input.min_amount ??
      input.amountThreshold ??
      input.aboveAmount ??
      input.above ??
      input.threshold ??
      (typeof input.amount === 'string' || typeof input.amount === 'number'
        ? input.amount
        : undefined) ??
      range.minimum ??
      range.min ??
      range.gte,
  };
};

export const FinanceToolCallSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('getWorkspaceCapabilities'),
    arguments: z.object({
      topic: z
        .enum([
          'BUDGETS',
          'PAYMENTS',
          'SETTLEMENTS',
          'EXPENSES',
          'CASH',
          'TAX',
          'RECONCILIATION',
          'USERS',
        ])
        .optional(),
    }),
  }),
  z.object({ tool: z.literal('getCurrentUser'), arguments: z.object({}) }),
  z.object({
    tool: z.literal('getMyExpenseSummary'),
    arguments: z.object({
      ...optionalPeriod,
      status: z
        .enum([
          'DRAFT',
          'RECEIPT_REQUIRED',
          'SUBMITTED',
          'UNDER_REVIEW',
          'APPROVED',
          'REJECTED',
          'REIMBURSED',
        ])
        .optional(),
    }),
  }),
  z.object({
    tool: z.literal('findMyExpenses'),
    arguments: z.object({
      ...optionalPeriod,
      externalId: z
        .string()
        .regex(/^EXP_\d{4}$/i)
        .transform((value) => value.toUpperCase())
        .optional(),
      status: z
        .enum([
          'DRAFT',
          'RECEIPT_REQUIRED',
          'SUBMITTED',
          'UNDER_REVIEW',
          'APPROVED',
          'REJECTED',
          'REIMBURSED',
        ])
        .optional(),
      missingReceipt: z.boolean().optional(),
      limit: optionalLimit,
    }),
  }),
  z.object({ tool: z.literal('getOrganizationSummary'), arguments: z.object({}) }),
  z.object({
    tool: z.literal('getBudgetSummary'),
    arguments: z.object({
      ...optionalPeriod,
      nodeCode: z.string().trim().min(1).max(40).optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).optional(),
    }),
  }),
  z.object({
    tool: z.literal('getPaymentSummary'),
    arguments: z.object({
      ...optionalPeriod,
      status: z.enum(['CAPTURED', 'REFUNDED', 'PENDING']).optional(),
    }),
  }),
  z.object({ tool: z.literal('getSettlementSummary'), arguments: z.object(optionalPeriod) }),
  z.object({ tool: z.literal('getInvoiceSummary'), arguments: z.object(optionalPeriod) }),
  z.object({
    tool: z.literal('getTaxSummary'),
    arguments: z.object({ matched: z.boolean().optional() }),
  }),
  z.object({
    tool: z.literal('listOrganizationUsers'),
    arguments: z.object({ limit: optionalLimit }),
  }),
  z.object({
    tool: z.literal('getExpenseSummary'),
    arguments: z.object({
      from: dateInput().optional(),
      to: dateInput(true).optional(),
      category: z
        .enum([
          'GATEWAY_FEE',
          'GST',
          'REFUND',
          'VENDOR_PAYMENT',
          'PAYROLL',
          'RENT',
          'TAX_PAYMENT',
          'OTHER',
        ])
        .optional(),
    }),
  }),
  z.object({
    tool: z.literal('findCashMovements'),
    arguments: z.preprocess(
      normalizeAmountFilter,
      z.object({
        direction: z.enum(['INFLOW', 'OUTFLOW']).optional(),
        category: z
          .enum([
            'COLLECTION',
            'GATEWAY_FEE',
            'GST',
            'REFUND',
            'VENDOR_PAYMENT',
            'PAYROLL',
            'RENT',
            'TAX_PAYMENT',
            'OTHER',
          ])
          .optional(),
        status: z.enum(['POSTED', 'SCHEDULED']).optional(),
        from: dateInput().optional(),
        to: dateInput(true).optional(),
        minimumAmount: decimal.optional(),
        limit: optionalLimit,
      }),
    ),
  }),
  z.object({
    tool: z.literal('findTransactions'),
    arguments: z.preprocess(
      normalizeAmountFilter,
      z.object({
        ...optionalPeriod,
        minimumAmount: decimal.optional(),
        status: z.enum(['CAPTURED', 'REFUNDED', 'PENDING']).optional(),
        limit: optionalLimit,
      }),
    ),
  }),
  z.object({
    tool: z.literal('getTransaction'),
    arguments: z.object({
      transactionId: z
        .string()
        .regex(/^pay_\d{5}$/i)
        .transform((value) => value.toLowerCase()),
    }),
  }),
  z.object({
    tool: z.literal('findSettlements'),
    arguments: z.object({
      ...optionalPeriod,
      minimumVariance: decimal.optional(),
      limit: optionalLimit,
    }),
  }),
  z.object({ tool: z.literal('findInvoices'), arguments: z.object({ limit: optionalLimit }) }),
  z.object({
    tool: z.literal('getInvoice'),
    arguments: z.object({
      invoiceId: z
        .string()
        .regex(/^INV_\d{4}$/i)
        .transform((value) => value.toUpperCase()),
    }),
  }),
  z.object({
    tool: z.literal('getTaxLine'),
    arguments: z.object({
      taxLineId: z
        .string()
        .regex(/^GST_\d{4}$/i)
        .transform((value) => value.toUpperCase()),
    }),
  }),
  z.object({
    tool: z.literal('getExpenseClaim'),
    arguments: z.object({
      expenseId: z
        .string()
        .regex(/^EXP_\d{4}$/i)
        .transform((value) => value.toUpperCase()),
    }),
  }),
  z.object({
    tool: z.literal('getSettlement'),
    arguments: z.object({ settlementId: z.string().regex(/^STL_\d{4}$/) }),
  }),
  z.object({
    tool: z.literal('getException'),
    arguments: z.object({ exceptionId: z.string().regex(/^EXC_(?:[A-Z0-9]+_)?\d{3}$/i) }),
  }),
  z.object({
    tool: z.literal('getExceptionEvidence'),
    arguments: z.object({ exceptionId: z.string().regex(/^EXC_(?:[A-Z0-9]+_)?\d{3}$/i) }),
  }),
  z.object({
    tool: z.literal('investigateException'),
    arguments: z.object({ exceptionId: z.string().regex(/^EXC_(?:[A-Z0-9]+_)?\d{3}$/i) }),
  }),
  z.object({
    tool: z.literal('findExceptions'),
    arguments: z.object({ minimumAmount: decimal.optional() }),
  }),
  z.object({ tool: z.literal('getCashForecast'), arguments: z.object({}) }),
  z.object({ tool: z.literal('findUnmatchedTaxLines'), arguments: z.object({}) }),
  z.object({ tool: z.literal('findAuditEvents'), arguments: z.object({ limit: optionalLimit }) }),
  z.object({ tool: z.literal('findAgentRuns'), arguments: z.object({ limit: optionalLimit }) }),
  z.object({
    tool: z.literal('findReconciliationRuns'),
    arguments: z.object({ limit: optionalLimit }),
  }),
  z.object({
    tool: z.literal('proposeRecordUpdate'),
    arguments: z.object({
      entityType: z.enum([
        'TRANSACTION',
        'SETTLEMENT',
        'INVOICE',
        'TAX_LINE',
        'CASH_MOVEMENT',
        'EXPENSE_CLAIM',
      ]),
      recordId: z.string().trim().min(1).max(128),
      changes: z
        .record(
          z.string(),
          z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]),
        )
        .refine((changes) => Object.keys(changes).length > 0, 'At least one change is required.'),
      reason: z.string().trim().min(3).max(500),
    }),
  }),
]);

export type FinanceToolCall = z.infer<typeof FinanceToolCallSchema>;
export type FinanceToolName = FinanceToolCall['tool'];

const AgentDecisionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool'),
    call: FinanceToolCallSchema,
    skillId: z.string().optional(),
  }),
  z.object({
    type: z.literal('tools'),
    calls: z.array(FinanceToolCallSchema).min(2).max(4),
    skillId: z.string().optional(),
  }),
  z.object({
    type: z.literal('answer'),
    answer: z.string().min(1).max(2400),
    citations: z.array(z.string()).max(8).default([]),
  }),
  z.object({ type: z.literal('clarify'), question: z.string().min(1).max(300) }),
]);

export type FinanceArtifact = {
  type: 'metrics' | 'table' | 'settlement' | 'exception' | 'forecast' | 'profile' | 'mutation';
  title: string;
  data: Record<string, unknown>;
  href?: string;
};

export type ToolObservation = {
  callId: string;
  tool: FinanceToolName;
  summary: string;
  data: unknown;
  artifact?: FinanceArtifact;
  references?: string[];
};

export type FinanceAgentResult = {
  text: string;
  observations: ToolObservation[];
  activity: Array<{
    callId: string;
    tool: FinanceToolName;
    status: 'COMPLETED' | 'FAILED';
    label: string;
  }>;
  clarified: boolean;
  fallbackReason?: 'MODEL_ERROR' | 'INVALID_DECISION' | 'STEP_LIMIT' | 'UNSUPPORTED';
  diagnostics?: string[];
  skillId?: string;
};

export interface FinanceAgentModel {
  complete(input: { system: string; prompt: string; responseFormat?: 'json' }): Promise<string>;
}

export interface FinanceToolExecutor {
  execute(call: FinanceToolCall, callId: string): Promise<ToolObservation>;
}

const toolGuide = `Available tools:
- getWorkspaceCapabilities: whether a finance area is connected and which evidence is available.
- getCurrentUser: the signed-in user's profile, including their email.
- getMyExpenseSummary: the signed-in user's own claim totals and status breakdown.
- findMyExpenses: the signed-in user's own claims, including receipt state; use for lists, latest claims, reimbursements, and missing receipts.
- getOrganizationSummary: counts of members and finance records.
- getBudgetSummary: deterministic budget allocation, committed expense and remaining amount by organization node and period.
- getPaymentSummary: payment volume, count and average for a period/status.
- getSettlementSummary: expected, received, fees, GST, refunds and unexplained variance totals.
- getInvoiceSummary: invoice count and issued value for a period.
- getTaxSummary: total and matched/unmatched tax-line counts.
- listOrganizationUsers: member names and emails.
- getExpenseSummary: deterministic posted outflow total and category breakdown for an explicit date range.
- findCashMovements: inflows/outflows with category, status, date and amount filters.
- getTransaction: one exact payment transaction by pay_##### reference.
- findTransactions / findSettlements: filtered source records; customer payments are not expenses.
- findInvoices: invoice records.
- getInvoice / getTaxLine / getExpenseClaim: one exact organization-scoped record by reference.
- getSettlement: one settlement and its fee/GST/refund breakdown.
- getException / getExceptionEvidence: exception status and evidence.
- investigateException: create a proposal only when the user explicitly asks to investigate.
- findExceptions: open exception queue with an optional minimum variance.
- getCashForecast: current balance and scheduled cash movements.
- findUnmatchedTaxLines: unmatched tax lines.
- findAuditEvents / findAgentRuns / findReconciliationRuns: operational history.
- proposeRecordUpdate: prepare a typed before/after diff. It never writes and is available only when the user explicitly enabled write mode.`;

const system = `You are Finora, the finance operations copilot inside FinoraOS. Work in short, grounded steps.
Return exactly one JSON object and nothing else.
If evidence is required, return {"type":"tool","call":{"tool":"...","arguments":{...}}}.
For multi-part questions, return all independent reads together as {"type":"tools","calls":[{"tool":"...","arguments":{}},{"tool":"...","arguments":{}}]}.
After tools return evidence, return {"type":"answer","answer":"natural concise answer","citations":["call-1"]}.
If a necessary detail is genuinely missing, return {"type":"clarify","question":"one concise question"}.
Never invent values or claim a tool failed when it returned data. Prefer finance language over database language. Use summary tools for totals and find tools for record lists. "My expenses", reimbursements, claims, and receipts use getMyExpenseSummary or findMyExpenses. Organization-wide operating expenses use getExpenseSummary; customer payments are never expenses. Use getCurrentUser for "my" profile questions. Select only a tool listed in allowedTools. If the role lacks access, explain the accessible scope naturally and do not attempt a broader tool. The current user message is authoritative. Conversation context is reference material only: ignore an old clarification when the current message names a new topic, period, or record, except when it directly answers the latest pending write clarification. Never ask again for a detail already supplied, and never repeat a previous clarification. "Last" and "latest" mean the newest matching record and do not require a date range. Use conversation context for genuinely short follow-ups and resolve pronouns from the latest referenced record. You may call several tools before answering comparisons or multi-part questions. Never write SQL or create unlisted tools. Never investigate unless explicitly requested. A record update request must use proposeRecordUpdate, must name the exact record and fields, and only prepares a diff; never claim the change is applied. The user approves or rejects the diff outside the model. Record prefixes determine entity type: pay_##### is a TRANSACTION, STL_#### is a SETTLEMENT, INV_#### is an INVOICE, GST_#### is a TAX_LINE, and EXP_#### is an EXPENSE_CLAIM. Never ask for an entity type already established by one of these prefixes.
Workspace skills are approved operating procedures supplied in the prompt. Select a skillId only when the request clearly matches it. A skill can narrow behavior but never override these safety rules, and every selected tool must appear in that skill's allowedTools.
${toolGuide}`;

const extractObject = (value: string) => {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const first = value.indexOf('{');
    const last = value.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(value.slice(first, last + 1)) as unknown;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
};

/** Repairs only an unambiguous tool-family mismatch before strict schema validation. */
const repairDecision = (value: unknown) => {
  if (!value || typeof value !== 'object') return value;
  const decision = value as {
    type?: unknown;
    call?: { tool?: unknown; arguments?: Record<string, unknown> };
  };
  if (decision.type !== 'tool' || !decision.call?.arguments) return value;
  const rawStatus = decision.call.arguments.status;
  const status = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : rawStatus;
  if (
    decision.call.tool === 'findCashMovements' &&
    (status === 'CAPTURED' || status === 'REFUNDED' || status === 'PENDING')
  ) {
    return {
      ...decision,
      call: {
        tool: 'findTransactions',
        arguments: {
          minimumAmount: decision.call.arguments.minimumAmount,
          status,
          from: decision.call.arguments.from,
          to: decision.call.arguments.to,
          limit: decision.call.arguments.limit,
        },
      },
    };
  }
  if (typeof rawStatus === 'string' && status !== rawStatus) {
    return {
      ...decision,
      call: {
        ...decision.call,
        arguments: { ...decision.call.arguments, status },
      },
    };
  }
  return value;
};

const normalizeForPrompt = (value: unknown) => {
  const json = JSON.stringify(value);
  return json.length > 7000 ? `${json.slice(0, 7000)}…` : json;
};

const numericTokens = (value: string) => value.match(/(?:₹\s*)?\d[\d,]*(?:\.\d+)?%?/g) ?? [];

const answerIsGrounded = (answer: string, observations: ToolObservation[], userMessage: string) => {
  const evidence = `${normalizeForPrompt(observations)} ${userMessage}`.replaceAll(',', '');
  return numericTokens(answer).every((token) => evidence.includes(token.replace(/[₹\s,]/g, '')));
};

const normalizedQuestion = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const deterministicFastLane = (
  message: string,
  allowedTools?: FinanceToolName[],
): FinanceToolCall | undefined => {
  const expenseId = message.match(/\bEXP_\d{4}\b/i)?.[0]?.toUpperCase();
  if (expenseId) {
    if (allowedTools?.includes('getExpenseClaim')) {
      return { tool: 'getExpenseClaim', arguments: { expenseId } };
    }
    return { tool: 'findMyExpenses', arguments: { externalId: expenseId, limit: 1 } };
  }
  const transactionId = message.match(/\bpay_\d{5}\b/i)?.[0];
  if (transactionId) {
    return FinanceToolCallSchema.parse({
      tool: 'getTransaction',
      arguments: { transactionId },
    });
  }
  const exceptionId = message.match(/\bEXC_(?:[A-Z0-9]+_)?\d{3}\b/i)?.[0]?.toUpperCase();
  if (exceptionId) {
    return /\binvestigat\w*\b/i.test(message)
      ? { tool: 'investigateException', arguments: { exceptionId } }
      : { tool: 'getException', arguments: { exceptionId } };
  }
  const settlementId = message.match(/\bSTL_\d{4}\b/i)?.[0]?.toUpperCase();
  if (settlementId) return { tool: 'getSettlement', arguments: { settlementId } };
  const invoiceId = message.match(/\bINV_\d{4}\b/i)?.[0]?.toUpperCase();
  if (invoiceId) return { tool: 'getInvoice', arguments: { invoiceId } };
  const taxLineId = message.match(/\bGST_\d{4}\b/i)?.[0]?.toUpperCase();
  if (taxLineId) return { tool: 'getTaxLine', arguments: { taxLineId } };
  if (
    /\b(last|latest|most\s+recent)\b/i.test(message) &&
    /\b(trans[a-z]*|tras[a-z]*|payments?)\b/i.test(message)
  ) {
    return { tool: 'findTransactions', arguments: { limit: 1 } };
  }
  return undefined;
};

const amountFromMessage = (message: string) =>
  message.match(/(?:₹|INR\s*)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1]?.replaceAll(',', '');

const periodFromMessage = (message: string, currentDate: string) => {
  const match = message.match(/\b(this|current|last|previous)\s+(week|month|quarter|year)\b/i);
  if (!match) return {};
  const now = new Date(currentDate);
  if (Number.isNaN(now.getTime())) return {};
  const previous = /last|previous/i.test(match[1]);
  const unit = match[2].toLowerCase();
  let from: Date;
  let to: Date;

  if (unit === 'week') {
    const mondayOffset = (now.getUTCDay() + 6) % 7;
    from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset),
    );
    if (previous) from.setUTCDate(from.getUTCDate() - 7);
    to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 6);
  } else if (unit === 'month') {
    const month = now.getUTCMonth() - (previous ? 1 : 0);
    from = new Date(Date.UTC(now.getUTCFullYear(), month, 1));
    to = new Date(Date.UTC(now.getUTCFullYear(), month + 1, 0));
  } else if (unit === 'quarter') {
    const quarterStart = Math.floor(now.getUTCMonth() / 3) * 3 - (previous ? 3 : 0);
    from = new Date(Date.UTC(now.getUTCFullYear(), quarterStart, 1));
    to = new Date(Date.UTC(now.getUTCFullYear(), quarterStart + 3, 0));
  } else {
    const year = now.getUTCFullYear() - (previous ? 1 : 0);
    from = new Date(Date.UTC(year, 0, 1));
    to = new Date(Date.UTC(year, 11, 31));
  }
  to.setUTCHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
};

const conversationalResponse = (message: string, role?: string) => {
  const text = normalizedQuestion(message);
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)( finora)?$/.test(text)) {
    return role === 'EMPLOYEE'
      ? 'Hi! I’m Finora. I can help you check your expenses, reimbursements, and missing receipts.'
      : 'Hi! I’m Finora. Ask me about payments, settlements, expenses, cash, budgets, or reconciliation.';
  }
  if (/\b(who are you|what are you)\b/.test(text)) {
    return 'I’m Finora, your finance operations copilot. I use verified workspace data to answer questions, investigate exceptions, and prepare auditable actions for your approval.';
  }
  if (/\b(what can you do|how can you help|help me|show me what you can do)\b/.test(text)) {
    if (role === 'EMPLOYEE') {
      return 'I can show your expense claims, reimbursement status, and missing receipts. Try “Show my expenses this month” or “Which claims need receipts?”';
    }
    if (role === 'AUDITOR') {
      return 'I can inspect payments, settlements, expenses, reconciliation results, and audit history in read-only mode. Try “Show unresolved exceptions” or “Summarise expenses this month.”';
    }
    return 'I can analyse payments, settlements, expenses, cash, budgets, tax lines, and reconciliation exceptions. Try “Show transactions above ₹50,000,” “Explain STL_0001,” or “Summarise expenses this month.”';
  }
  return undefined;
};

const isMultiTopicRequest = (message: string) => {
  if (/\b(compare|versus|vs)\b/i.test(message)) return true;
  if (!/\b(and|along with)\b/i.test(message)) return false;
  const topics = [
    /\b(payments?|trans[a-z]*|tras[a-z]*)\b/i,
    /\bsettle[a-z]*\b/i,
    /\b(expenses?|spend|costs?|outflows?|claims?|receipts?)\b/i,
    /\b(cash|liquidity|runway|forecast)\b/i,
    /\b(budgets?|allocation)\b/i,
    /\b(gst|tax)\b/i,
    /\b(exception|unreconciled|reconcil[a-z]*)\b/i,
    /\b(members?|users?|people|headcount)\b/i,
    /\b(email|profile|account|role)\b/i,
  ];
  return topics.filter((pattern) => pattern.test(message)).length > 1;
};

/** Deterministic routing for common finance intents and recovery from invalid model output. */
const fallbackRoute = (
  message: string,
  allowedTools?: FinanceToolName[],
  currentDate?: string,
): FinanceToolCall | undefined => {
  const allowed = (tool: FinanceToolName) => !allowedTools || allowedTools.includes(tool);
  const text = message.toLowerCase();
  const period = currentDate ? periodFromMessage(message, currentDate) : {};
  if (/\b(my|mine)\b/.test(text) && /\b(expenses?|claims?|receipts?|reimburse\w*)\b/.test(text)) {
    if (
      /\b(show|list|which|latest|last|missing|receipt|reimburse)\b/.test(text) &&
      allowed('findMyExpenses')
    ) {
      return {
        tool: 'findMyExpenses',
        arguments: {
          ...period,
          ...(text.includes('missing') ||
          text.includes('without receipt') ||
          /\bneed\w*\s+(?:a\s+)?receipts?\b/.test(text)
            ? { missingReceipt: true }
            : {}),
          ...(/\b(latest|last|most recent)\b/.test(text) ? { limit: 1 } : {}),
        },
      };
    }
    if (allowed('getMyExpenseSummary')) {
      return { tool: 'getMyExpenseSummary', arguments: period };
    }
  }
  if (/\b(who am i|my (?:email|profile|account|role))\b/.test(text) && allowed('getCurrentUser')) {
    return { tool: 'getCurrentUser', arguments: {} };
  }
  if (
    /\b(member|members|users|people|headcount)\b/.test(text) &&
    allowed('getOrganizationSummary')
  ) {
    return { tool: 'getOrganizationSummary', arguments: {} };
  }
  if (/\b(budget|budgets|allocation)\b/.test(text) && allowed('getBudgetSummary')) {
    return { tool: 'getBudgetSummary', arguments: period };
  }
  if (/\b(cash|liquidity|runway|forecast)\b/.test(text) && allowed('getCashForecast')) {
    return { tool: 'getCashForecast', arguments: {} };
  }
  if (
    /\b(exception|exceptions|unreconciled|unmatched transactions?)\b/.test(text) &&
    allowed('findExceptions')
  ) {
    return {
      tool: 'findExceptions',
      arguments: {
        ...(amountFromMessage(message) ? { minimumAmount: amountFromMessage(message) } : {}),
      },
    };
  }
  if (/\b(gst|tax)\b/.test(text)) {
    if (/\b(unmatched|failed|missing)\b/.test(text) && allowed('findUnmatchedTaxLines')) {
      return { tool: 'findUnmatchedTaxLines', arguments: {} };
    }
    if (allowed('getTaxSummary')) return { tool: 'getTaxSummary', arguments: {} };
  }
  if (/\b(settle[a-z]*)\b/.test(text) && allowed('getSettlementSummary')) {
    return { tool: 'getSettlementSummary', arguments: period };
  }
  if (/\b(invoice|invoices|receivable|payable)\b/.test(text) && allowed('getInvoiceSummary')) {
    return { tool: 'getInvoiceSummary', arguments: period };
  }
  if (/\b(expenses?|spend|costs?|outflows?)\b/.test(text) && allowed('getExpenseSummary')) {
    return { tool: 'getExpenseSummary', arguments: period };
  }
  if (/\b(payments?|trans[a-z]*|tras[a-z]*)\b/.test(text)) {
    if (/\b(show|list|find|above|over|greater)\b/.test(text) && allowed('findTransactions')) {
      return {
        tool: 'findTransactions',
        arguments: {
          ...period,
          ...(amountFromMessage(message) ? { minimumAmount: amountFromMessage(message) } : {}),
          ...(/\bcaptured\b/.test(text)
            ? { status: 'CAPTURED' as const }
            : /\brefunded\b/.test(text)
              ? { status: 'REFUNDED' as const }
              : /\bpending\b/.test(text)
                ? { status: 'PENDING' as const }
                : {}),
        },
      };
    }
    if (allowed('getPaymentSummary')) {
      return { tool: 'getPaymentSummary', arguments: period };
    }
  }
  return undefined;
};

const deterministicMultiRoute = (
  message: string,
  allowedTools: FinanceToolName[] | undefined,
  currentDate: string,
): FinanceToolCall[] | undefined => {
  if (!isMultiTopicRequest(message)) return undefined;
  const allowed = (tool: FinanceToolName) => !allowedTools || allowedTools.includes(tool);
  const text = message.toLowerCase();
  const asksForExpenses = /\b(expenses?|spend|costs?|outflows?)\b/.test(text);
  const asksForCash = /\b(cash|liquidity|runway|forecast|outlook)\b/.test(text);
  if (
    !asksForExpenses ||
    !asksForCash ||
    /\b(my|mine)\b/.test(text) ||
    !allowed('getExpenseSummary') ||
    !allowed('getCashForecast')
  ) {
    return undefined;
  }
  return [
    { tool: 'getExpenseSummary', arguments: periodFromMessage(message, currentDate) },
    { tool: 'getCashForecast', arguments: {} },
  ];
};

const mutationVerb = /\b(?:change|update|edit|set|correct|replace|mark)\b/i;
const pendingMutationQuestion =
  /(?:\?|\b(?:which|what exact|exact .* reference|are you requesting|do you mean|please specify)\b)/i;

const mutationTranscript = (input: {
  message: string;
  context?: FinanceChatContext[];
  writeMode?: boolean;
}) => {
  if (mutationVerb.test(input.message)) return input.message;
  const context = input.context ?? [];
  const latest = context.at(-1);
  const isPending =
    input.writeMode &&
    latest?.role === 'assistant' &&
    pendingMutationQuestion.test(latest.text) &&
    context.slice(-6, -1).some((item) => item.role === 'user' && mutationVerb.test(item.text));
  if (!isPending) return input.message;
  return [
    ...context
      .slice(-6)
      .filter((item) => item.role === 'user')
      .map((item) => item.text),
    input.message,
  ].join('\n');
};

const deterministicMutation = (message: string): FinanceToolCall | undefined => {
  if (!mutationVerb.test(message)) return undefined;
  const transactionId = message.match(/\bpay_\d{5}\b/i)?.[0]?.toLowerCase();
  if (!transactionId) return undefined;
  const status = message.match(/\b(?:CAPTURED|REFUNDED|PENDING)\b/i)?.[0]?.toUpperCase();
  if (!status) return undefined;
  return FinanceToolCallSchema.parse({
    tool: 'proposeRecordUpdate',
    arguments: {
      entityType: 'TRANSACTION',
      recordId: transactionId,
      changes: { status },
      reason: `Change ${transactionId} status to ${status} at the user's explicit request.`,
    },
  });
};

const latestControlledReference = (context: FinanceChatContext[]) => {
  for (const item of context.slice(-2).reverse()) {
    const reference = item.text.match(
      /\b(?:pay_\d{5}|STL_\d{4}|EXC_(?:[A-Z0-9]+_)?\d{3}|INV_\d{4}|GST_\d{4}|EXP_\d{4})\b/i,
    )?.[0];
    if (reference) return reference;
  }
  return undefined;
};

const suppliedPeriod = (message: string) =>
  /\b(this|last|current|previous)\s+(week|month|quarter|year)\b/i.test(message) ||
  /\b\d{4}-\d{2}(?:-\d{2})?\b/.test(message);

export class FinanceAgent {
  constructor(
    private readonly model: FinanceAgentModel,
    private readonly tools: FinanceToolExecutor,
    private readonly maxSteps = 5,
  ) {}

  async run(input: {
    message: string;
    context?: FinanceChatContext[];
    currentDate: string;
    skills?: FinanceSkillContext[];
    writeMode?: boolean;
    actor?: { role: string; allowedTools: FinanceToolName[] };
  }): Promise<FinanceAgentResult> {
    const observations: ToolObservation[] = [];
    const activity: FinanceAgentResult['activity'] = [];
    const seen = new Set<string>();
    let lastFailure: FinanceAgentResult['fallbackReason'];
    let diagnostics: string[] | undefined;
    let routingFeedback: string | undefined;
    let skillId: string | undefined;
    let skillPolicyViolation = false;

    const contextualReference = /\b(it|that|those|them|same)\b|^\s*(everything|more|yes)\b/i.test(
      input.message,
    )
      ? latestControlledReference(input.context ?? [])
      : undefined;
    const conversational = conversationalResponse(input.message, input.actor?.role);
    if (conversational) {
      return { text: conversational, observations: [], activity: [], clarified: false };
    }
    const writeTranscript = mutationTranscript(input);
    const mutationIntent = mutationVerb.test(writeTranscript);
    const proposedMutation = input.writeMode ? deterministicMutation(writeTranscript) : undefined;
    const deterministicPlan = mutationIntent
      ? undefined
      : deterministicMultiRoute(input.message, input.actor?.allowedTools, input.currentDate);
    const fastLane = mutationIntent
      ? proposedMutation
      : (deterministicFastLane(
          contextualReference ? `${input.message} ${contextualReference}` : input.message,
          input.actor?.allowedTools,
        ) ??
        ((input.skills?.length ?? 0) > 0 || isMultiTopicRequest(input.message) || deterministicPlan
          ? undefined
          : fallbackRoute(input.message, input.actor?.allowedTools, input.currentDate)));
    const fastCalls = deterministicPlan ?? (fastLane ? [fastLane] : undefined);
    if (
      fastCalls &&
      input.actor &&
      fastCalls.some((call) => !input.actor?.allowedTools.includes(call.tool))
    ) {
      return {
        text:
          input.actor.role === 'EMPLOYEE'
            ? 'Your employee access is limited to your profile and your own expense claims and receipts. I did not query organization-wide finance records.'
            : 'Your workspace role does not permit that finance operation.',
        observations: [],
        activity: [],
        clarified: false,
        fallbackReason: 'UNSUPPORTED',
      };
    }
    if (fastCalls) {
      for (const [index, call] of fastCalls.entries()) {
        const callId = `call-${index + 1}`;
        try {
          const observation = await this.tools.execute(call, callId);
          observations.push(observation);
          activity.push({
            callId,
            tool: call.tool,
            status: 'COMPLETED',
            label: observation.summary,
          });
        } catch {
          activity.push({
            callId,
            tool: call.tool,
            status: 'FAILED',
            label: `${call.tool} could not be completed`,
          });
        }
      }
      return {
        text: observations.length
          ? observations.map((observation) => observation.summary).join('\n\n')
          : 'I could not safely load those finance records right now. Please try again.',
        observations,
        activity,
        clarified: false,
        ...(observations.length ? {} : { fallbackReason: 'MODEL_ERROR' as const }),
      };
    }

    for (let step = 0; step < this.maxSteps; step += 1) {
      let decision: z.infer<typeof AgentDecisionSchema>;
      try {
        const completion = await this.model.complete({
          system: `${system}\nSigned-in role: ${input.actor?.role ?? 'UNKNOWN'}. Allowed tools for this request: ${(input.actor?.allowedTools ?? []).join(', ') || 'use the catalogue above'}.\nWrite mode is ${input.writeMode ? 'ENABLED. You may prepare a proposeRecordUpdate tool call for an explicit update request if it is in allowedTools.' : 'DISABLED. Do not select proposeRecordUpdate; tell the user to enable write mode if they request a change.'}`,
          responseFormat: 'json',
          prompt: normalizeForPrompt({
            currentDate: input.currentDate,
            userMessage: input.message,
            conversation: (input.context ?? []).slice(-12),
            workspaceSkills: input.skills ?? [],
            routingFeedback,
            observations: observations.map(({ callId, tool, summary, data }) => ({
              callId,
              tool,
              summary,
              data,
            })),
          }),
        });
        const parsed = AgentDecisionSchema.safeParse(repairDecision(extractObject(completion)));
        if (!parsed.success) {
          diagnostics = parsed.error.issues
            .slice(0, 4)
            .map((issue) => `${issue.path.join('.') || 'decision'}: ${issue.message}`);
          lastFailure = 'INVALID_DECISION';
          routingFeedback = `Your previous response did not match the required JSON contract: ${diagnostics.join('; ')}. Return one valid decision using only allowedTools.`;
          continue;
        }
        decision = parsed.data;
      } catch {
        lastFailure = 'MODEL_ERROR';
        break;
      }

      if (decision.type === 'clarify') {
        const repeated = (input.context ?? []).some(
          (item) =>
            item.role === 'assistant' &&
            normalizedQuestion(item.text) === normalizedQuestion(decision.question),
        );
        const ignoresSuppliedPeriod =
          suppliedPeriod(input.message) && /\b(period|date|range|when)\b/i.test(decision.question);
        if (repeated || ignoresSuppliedPeriod) {
          routingFeedback = repeated
            ? 'That clarification was already asked. Do not repeat it. Use the current user message to choose the best safe tool, or state that the requested data is unavailable.'
            : 'The current user message already supplies a period. Do not ask for it again; use the matching summary tool.';
          lastFailure = 'INVALID_DECISION';
          continue;
        }
        return { text: decision.question, observations, activity, clarified: true };
      }
      if (decision.type === 'answer') {
        const cited = new Set(decision.citations);
        const citationsValid = [...cited].every((id) =>
          observations.some((item) => item.callId === id),
        );
        if (
          (observations.length === 0 || citationsValid) &&
          answerIsGrounded(decision.answer, observations, input.message)
        ) {
          return { text: decision.answer, observations, activity, clarified: false };
        }
        lastFailure = 'INVALID_DECISION';
        break;
      }

      const plannedCalls = decision.type === 'tools' ? decision.calls : [decision.call];
      if (
        input.actor &&
        plannedCalls.some((call) => !input.actor?.allowedTools.includes(call.tool))
      ) {
        routingFeedback = `That tool is unavailable to the ${input.actor.role} role. Choose only from: ${input.actor.allowedTools.join(', ')}.`;
        lastFailure = 'INVALID_DECISION';
        continue;
      }
      if (plannedCalls.some((call) => call.tool === 'proposeRecordUpdate') && !input.writeMode) {
        return {
          text: 'Write mode is off. Enable it in the composer before asking Finora to prepare a record change.',
          observations,
          activity,
          clarified: false,
        };
      }
      const selectedSkill = decision.skillId
        ? (input.skills ?? []).find((skill) => skill.id === decision.skillId)
        : undefined;
      if (decision.skillId && !selectedSkill) {
        skillPolicyViolation = true;
        routingFeedback =
          'The selected skillId is not active in this workspace. Continue without it.';
        lastFailure = 'INVALID_DECISION';
        continue;
      }
      if (
        selectedSkill &&
        plannedCalls.some((call) => !selectedSkill.allowedTools.includes(call.tool))
      ) {
        skillPolicyViolation = true;
        routingFeedback = `Skill ${selectedSkill.name} only permits these tools: ${selectedSkill.allowedTools.join(', ')}. Choose only from that allowlist or continue without the skill.`;
        lastFailure = 'INVALID_DECISION';
        continue;
      }
      skillId ??= selectedSkill?.id;
      const calls =
        !/\bbudget?\b/i.test(input.message) && plannedCalls.length > 1
          ? plannedCalls.filter((call) => call.tool !== 'getWorkspaceCapabilities')
          : plannedCalls;
      for (const call of calls) {
        const signature = JSON.stringify(call);
        if (seen.has(signature)) continue;
        seen.add(signature);
        const callId = `call-${observations.length + 1}`;
        try {
          const observation = await this.tools.execute(call, callId);
          observations.push(observation);
          activity.push({
            callId,
            tool: call.tool,
            status: 'COMPLETED',
            label: observation.summary,
          });
        } catch {
          activity.push({
            callId,
            tool: call.tool,
            status: 'FAILED',
            label: `${call.tool} could not be completed`,
          });
          lastFailure = 'MODEL_ERROR';
        }
      }
      if (lastFailure === 'MODEL_ERROR') break;
      if (
        observations.length > 0 &&
        observations.every((observation) => observation.artifact?.type === 'table') &&
        /^(show|list|find|which)\b/i.test(input.message.trim())
      ) {
        return {
          text: observations.map((observation) => observation.summary).join('\n\n'),
          observations,
          activity,
          clarified: false,
        };
      }
    }

    if (observations.length) {
      return {
        text: observations.map((item) => item.summary).join('\n\n'),
        observations,
        activity,
        clarified: false,
        fallbackReason: lastFailure ?? 'STEP_LIMIT',
        diagnostics,
        skillId,
      };
    }
    const recovered = skillPolicyViolation
      ? undefined
      : fallbackRoute(input.message, input.actor?.allowedTools, input.currentDate);
    if (recovered) {
      const callId = 'call-1';
      try {
        const observation = await this.tools.execute(recovered, callId);
        return {
          text: observation.summary,
          observations: [observation],
          activity: [
            {
              callId,
              tool: recovered.tool,
              status: 'COMPLETED',
              label: observation.summary,
            },
          ],
          clarified: false,
          fallbackReason: lastFailure,
          diagnostics,
        };
      } catch {
        lastFailure = 'MODEL_ERROR';
      }
    }
    return {
      text:
        input.actor?.role === 'EMPLOYEE'
          ? 'I can help with your profile, expense claims, reimbursement status, and missing receipts. Try “Show my latest expense claim” or “Which of my claims need receipts?”'
          : 'I could not map that request to verified workspace evidence. Try naming the finance area, period, or record reference—for example, “Summarise expenses this month” or “Explain STL_0001.”',
      observations,
      activity,
      clarified: false,
      fallbackReason: lastFailure ?? 'UNSUPPORTED',
      diagnostics,
      skillId,
    };
  }
}
