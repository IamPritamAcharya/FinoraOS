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
  complete(input: { system: string; prompt: string }): Promise<string>;
}
const system = `You are the FinoraOS Controller. Return JSON only. Choose one allowed tool: getOrganizationSummary {}, listOrganizationUsers {limit?}, getSettlement {settlementId}, getException {exceptionId}, getExceptionEvidence {exceptionId}, investigateException {exceptionId}, findExceptions {minimumAmount?}, getCashForecast {}, findUnmatchedTaxLines {}, findTransactions {minimumAmount?,status?,limit?}, findInvoices {limit?}, findAuditEvents {limit?}, findAgentRuns {limit?}, findReconciliationRuns {limit?}, general {}. Use context for prior references. Investigate only on explicit request. Never write SQL, invent IDs, organization IDs, or tools.`;
export class ControllerAgent {
  constructor(private readonly model: ControllerModel) {}
  async route(message: string, context: ChatContextEntry[] = []): Promise<ControllerDecision> {
    try {
      const text = await this.model.complete({
        system,
        prompt: JSON.stringify({ message, context: context.slice(-12) }),
      });
      const json = text.match(/\{[\s\S]*\}/)?.[0];
      return ToolCallSchema.parse(JSON.parse(json ?? ''));
    } catch {
      return { tool: 'general', arguments: {} };
    }
  }
}
