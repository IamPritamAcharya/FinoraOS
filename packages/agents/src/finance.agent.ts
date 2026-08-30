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
    tool: z.literal('getSettlement'),
    arguments: z.object({ settlementId: z.string().regex(/^STL_\d{4}$/) }),
  }),
  z.object({
    tool: z.literal('getException'),
    arguments: z.object({ exceptionId: z.string().regex(/^EXC_\d{3}$/) }),
  }),
  z.object({
    tool: z.literal('getExceptionEvidence'),
    arguments: z.object({ exceptionId: z.string().regex(/^EXC_\d{3}$/) }),
  }),
  z.object({
    tool: z.literal('investigateException'),
    arguments: z.object({ exceptionId: z.string().regex(/^EXC_\d{3}$/) }),
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
Never invent values or claim a tool failed when it returned data. Prefer finance language over database language. Use summary tools for totals and find tools for record lists. Use getExpenseSummary for expenses/spend/costs/outflows, not findTransactions. Use getCurrentUser for "my" profile questions. The current user message is authoritative. Conversation context is reference material only: ignore an old clarification when the current message names a new topic, period, or record. Never ask again for a detail already supplied, and never repeat a previous clarification. "Last" and "latest" mean the newest matching record and do not require a date range. Use conversation context for genuinely short follow-ups and resolve pronouns from the latest referenced record. You may call several tools before answering comparisons or multi-part questions. Never write SQL or create unlisted tools. Never investigate unless explicitly requested. A record update request must use proposeRecordUpdate, must name the exact record and fields, and only prepares a diff; never claim the change is applied. The user approves or rejects the diff outside the model.
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

const deterministicFastLane = (message: string): FinanceToolCall | undefined => {
  const transactionId = message.match(/\bpay_\d{5}\b/i)?.[0];
  if (transactionId) {
    return FinanceToolCallSchema.parse({
      tool: 'getTransaction',
      arguments: { transactionId },
    });
  }
  const exceptionId = message.match(/\bEXC_\d{3}\b/i)?.[0]?.toUpperCase();
  if (exceptionId) {
    return /\binvestigat\w*\b/i.test(message)
      ? { tool: 'investigateException', arguments: { exceptionId } }
      : { tool: 'getException', arguments: { exceptionId } };
  }
  const settlementId = message.match(/\bSTL_\d{4}\b/i)?.[0]?.toUpperCase();
  if (settlementId) return { tool: 'getSettlement', arguments: { settlementId } };
  if (/\bbudget(?:s|ed|ing)?\b/i.test(message)) {
    return { tool: 'getBudgetSummary', arguments: {} };
  }
  if (
    /\b(last|latest|most\s+recent)\b/i.test(message) &&
    /\b(trans[a-z]*|tras[a-z]*|payments?)\b/i.test(message)
  ) {
    return { tool: 'findTransactions', arguments: { limit: 1 } };
  }
  return undefined;
};

const latestControlledReference = (context: FinanceChatContext[]) => {
  for (const item of context.slice(-2).reverse()) {
    const reference = item.text.match(/\b(?:pay_\d{5}|STL_\d{4}|EXC_\d{3})\b/i)?.[0];
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
  }): Promise<FinanceAgentResult> {
    const observations: ToolObservation[] = [];
    const activity: FinanceAgentResult['activity'] = [];
    const seen = new Set<string>();
    let lastFailure: FinanceAgentResult['fallbackReason'];
    let diagnostics: string[] | undefined;
    let routingFeedback: string | undefined;
    let skillId: string | undefined;

    const contextualReference = /\b(it|that|those|them|same)\b|^\s*(everything|more|yes)\b/i.test(
      input.message,
    )
      ? latestControlledReference(input.context ?? [])
      : undefined;
    const mutationIntent = /\b(change|update|edit|set|correct|replace|mark)\b/i.test(input.message);
    const fastLane = mutationIntent
      ? undefined
      : deterministicFastLane(
          contextualReference ? `${input.message} ${contextualReference}` : input.message,
        );
    if (fastLane) {
      const callId = 'call-1';
      try {
        const observation = await this.tools.execute(fastLane, callId);
        return {
          text: observation.summary,
          observations: [observation],
          activity: [
            {
              callId,
              tool: fastLane.tool,
              status: 'COMPLETED',
              label: observation.summary,
            },
          ],
          clarified: false,
        };
      } catch {
        return {
          text: 'I could not safely load that finance record right now. Please try again.',
          observations: [],
          activity: [
            {
              callId,
              tool: fastLane.tool,
              status: 'FAILED',
              label: `${fastLane.tool} could not be completed`,
            },
          ],
          clarified: false,
          fallbackReason: 'MODEL_ERROR',
        };
      }
    }

    for (let step = 0; step < this.maxSteps; step += 1) {
      let decision: z.infer<typeof AgentDecisionSchema>;
      try {
        const completion = await this.model.complete({
          system: `${system}\nWrite mode is ${input.writeMode ? 'ENABLED. You may prepare a proposeRecordUpdate tool call for an explicit update request.' : 'DISABLED. Do not select proposeRecordUpdate; tell the user to enable write mode if they request a change.'}`,
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
          break;
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
        routingFeedback =
          'The selected skillId is not active in this workspace. Continue without it.';
        lastFailure = 'INVALID_DECISION';
        continue;
      }
      if (
        selectedSkill &&
        plannedCalls.some((call) => !selectedSkill.allowedTools.includes(call.tool))
      ) {
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
    return {
      text: 'I can answer questions grounded in the financial records connected to this workspace. I could not safely map that request to available evidence yet—try adding the record, period, or finance topic you mean.',
      observations,
      activity,
      clarified: false,
      fallbackReason: lastFailure ?? 'UNSUPPORTED',
      diagnostics,
      skillId,
    };
  }
}
