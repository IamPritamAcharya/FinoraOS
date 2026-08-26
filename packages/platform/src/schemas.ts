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

export const RequestPrincipalSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
});

export type RequestPrincipal = z.infer<typeof RequestPrincipalSchema>;

export const FinoraArtifactSchema = z.object({
  type: z.enum(['metrics', 'table', 'settlement', 'exception', 'forecast', 'profile']),
  title: z.string(),
  data: z.record(z.string(), z.unknown()),
  href: z.string().optional(),
});

export const FinoraChatPayloadSchema = z.object({
  threadId: z.string(),
  messageId: z.string(),
  text: z.string(),
  artifacts: z.array(FinoraArtifactSchema),
  activity: z.array(
    z.object({
      callId: z.string(),
      tool: z.string(),
      status: z.enum(['COMPLETED', 'FAILED']),
      label: z.string(),
    }),
  ),
  references: z.array(z.string()),
  clarified: z.boolean(),
});

export type FinoraArtifact = z.infer<typeof FinoraArtifactSchema>;
export type FinoraChatPayload = z.infer<typeof FinoraChatPayloadSchema>;
