import { z } from 'zod';

export type ChatContextEntry = { role: 'user' | 'assistant'; text: string };

const ToolCallSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('getOrganizationSummary'), arguments: z.object({}) }),
  z.object({
    tool: z.literal('listOrganizationUsers'),
    arguments: z.object({ limit: z.number().int().min(1).max(100).optional() }),
  }),
  z.object({
    tool: z.literal('getSettlement'),
    arguments: z.object({ settlementId: z.string().regex(/^STL_\d{4}$/) }),
  }),
  z.object({
    tool: z.literal('getException'),
    arguments: z.object({ exceptionId: z.string().regex(/^EXC_\d{3}$/) }),
  }),
  z.object({
    tool: z.literal('investigateException'),
    arguments: z.object({ exceptionId: z.string().regex(/^EXC_\d{3}$/) }),
  }),
  z.object({
    tool: z.literal('findExceptions'),
    arguments: z.object({
      minimumAmount: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/)
        .optional(),
    }),
  }),
  z.object({ tool: z.literal('getCashForecast'), arguments: z.object({}) }),
  z.object({ tool: z.literal('findUnmatchedTaxLines'), arguments: z.object({}) }),
  z.object({
    tool: z.literal('findTransactions'),
    arguments: z.object({
      minimumAmount: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/)
        .optional(),
      status: z.enum(['CAPTURED', 'REFUNDED', 'PENDING']).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
  }),
  z.object({
    tool: z.literal('findInvoices'),
    arguments: z.object({ limit: z.number().int().min(1).max(100).optional() }),
  }),
  z.object({
    tool: z.literal('findAuditEvents'),
    arguments: z.object({ limit: z.number().int().min(1).max(100).optional() }),
  }),
  z.object({
    tool: z.literal('findAgentRuns'),
    arguments: z.object({ limit: z.number().int().min(1).max(100).optional() }),
  }),
  z.object({
    tool: z.literal('findReconciliationRuns'),
    arguments: z.object({ limit: z.number().int().min(1).max(100).optional() }),
  }),
  z.object({
    tool: z.literal('getExceptionEvidence'),
    arguments: z.object({ exceptionId: z.string().regex(/^EXC_\d{3}$/) }),
  }),
  z.object({ tool: z.literal('general'), arguments: z.object({}) }),
]);
export type ControllerDecision = z.infer<typeof ToolCallSchema>;
export interface ControllerModel {
  complete(input: { system: string; prompt: string; responseFormat?: 'json' }): Promise<string>;
}
export type ControllerRouteResult = {
  decision: ControllerDecision;
  source: 'model' | 'fallback';
  fallbackReason?: 'gateway-error' | 'no-json-object' | 'invalid-tool-call';
};

const system = `You are the FinoraOS Controller. Your entire response MUST be exactly one valid JSON object—no prose, Markdown, code fence, or explanation. Select exactly one allowed tool and only its stated argument shape:
{"tool":"getOrganizationSummary","arguments":{}}
{"tool":"listOrganizationUsers","arguments":{"limit":25}}
{"tool":"getSettlement","arguments":{"settlementId":"STL_0001"}}
{"tool":"getException","arguments":{"exceptionId":"EXC_005"}}
{"tool":"getExceptionEvidence","arguments":{"exceptionId":"EXC_005"}}
{"tool":"investigateException","arguments":{"exceptionId":"EXC_005"}}
{"tool":"findExceptions","arguments":{"minimumAmount":"50000"}}
{"tool":"getCashForecast","arguments":{}}
{"tool":"findUnmatchedTaxLines","arguments":{}}
{"tool":"findTransactions","arguments":{"minimumAmount":"50000","status":"CAPTURED","limit":25}}
{"tool":"findInvoices","arguments":{"limit":25}}
{"tool":"findAuditEvents","arguments":{"limit":25}}
{"tool":"findAgentRuns","arguments":{"limit":25}}
{"tool":"findReconciliationRuns","arguments":{"limit":25}}
{"tool":"general","arguments":{}}
Use the supplied context only to resolve a previously mentioned record ID. Choose investigateException only when the user explicitly asks to investigate. Never write SQL; never invent record IDs, organization IDs, fields, amounts, or tools. If no tool is suitable, return general.`;

const fallback = (): ControllerDecision => ({ tool: 'general', arguments: {} });

const extractJsonObject = (value: string) => {
  const trimmed = value.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // A provider may preface JSON with a thought despite the contract; extract one balanced object safely.
  }
  let depth = 0;
  let start = -1;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = value.slice(start, index + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          start = -1;
        }
      }
    }
  }
  return undefined;
};

export class ControllerAgent {
  constructor(private readonly model: ControllerModel) {}
  async routeDetailed(
    message: string,
    context: ChatContextEntry[] = [],
  ): Promise<ControllerRouteResult> {
    let text: string;
    try {
      text = await this.model.complete({
        system,
        prompt: JSON.stringify({ message, context: context.slice(-12) }),
        responseFormat: 'json',
      });
    } catch {
      return { decision: fallback(), source: 'fallback', fallbackReason: 'gateway-error' };
    }
    const json = extractJsonObject(text);
    if (!json)
      return { decision: fallback(), source: 'fallback', fallbackReason: 'no-json-object' };
    const parsed = ToolCallSchema.safeParse(JSON.parse(json));
    if (!parsed.success)
      return { decision: fallback(), source: 'fallback', fallbackReason: 'invalid-tool-call' };
    return { decision: parsed.data, source: 'model' };
  }
  async route(message: string, context: ChatContextEntry[] = []) {
    return (await this.routeDetailed(message, context)).decision;
  }
}
