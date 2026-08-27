import { z } from 'zod';
import { ExceptionStatus, ExceptionType, WorkspacePermission, WorkspaceRole } from './enums.js';

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
  role: z.nativeEnum(WorkspaceRole).optional(),
});

export type RequestPrincipal = z.infer<typeof RequestPrincipalSchema>;

const rolePermissions: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  [WorkspaceRole.EMPLOYEE]: [
    WorkspacePermission.VIEW_OWN_FINANCE,
    WorkspacePermission.SUBMIT_EXPENSE,
  ],
  [WorkspaceRole.FINANCE_OPERATOR]: [
    WorkspacePermission.VIEW_OWN_FINANCE,
    WorkspacePermission.VIEW_ORGANIZATION_FINANCE,
    WorkspacePermission.SUBMIT_EXPENSE,
    WorkspacePermission.REVIEW_EXPENSE,
    WorkspacePermission.VIEW_AGENT_AUDIT,
  ],
  [WorkspaceRole.FINANCE_CONTROLLER]: [
    WorkspacePermission.VIEW_OWN_FINANCE,
    WorkspacePermission.VIEW_ORGANIZATION_FINANCE,
    WorkspacePermission.SUBMIT_EXPENSE,
    WorkspacePermission.REVIEW_EXPENSE,
    WorkspacePermission.MANAGE_BUDGET,
    WorkspacePermission.MANAGE_AGENT_SKILL,
    WorkspacePermission.VIEW_AGENT_AUDIT,
    WorkspacePermission.APPROVE_FINANCE_ACTION,
  ],
  [WorkspaceRole.ENTERPRISE_ADMIN]: Object.values(WorkspacePermission),
  [WorkspaceRole.AUDITOR]: [
    WorkspacePermission.VIEW_OWN_FINANCE,
    WorkspacePermission.VIEW_ORGANIZATION_FINANCE,
    WorkspacePermission.VIEW_AGENT_AUDIT,
  ],
};

export const hasWorkspacePermission = (
  principal: RequestPrincipal,
  permission: WorkspacePermission,
) => rolePermissions[principal.role ?? WorkspaceRole.EMPLOYEE].includes(permission);

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
