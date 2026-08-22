import { z } from 'zod';
import { ExceptionStatus, ExceptionType } from './enums.js';

export const MoneySchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Use a decimal string'),
  currency: z.string().length(3),
});

export const ProposedActionSchema = z.object({
  type: z.enum(['CREATE_SETTLEMENT_FEE_ADJUSTMENT', 'MARK_MISSING_RECORD', 'REQUEST_HUMAN_REVIEW']),
  requiresApproval: z.boolean(),
  payload: z.record(z.string(), z.unknown()),
});

export const ExceptionResolutionSchema = z.object({
  exceptionId: z.string(),
  status: z.nativeEnum(ExceptionStatus),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  type: z.nativeEnum(ExceptionType),
  proposedActions: z.array(ProposedActionSchema),
});

export type ExceptionResolution = z.infer<typeof ExceptionResolutionSchema>;
