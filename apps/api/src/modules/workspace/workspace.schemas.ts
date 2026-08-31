import { z } from 'zod';
import {
  AgentSkillStatus,
  BudgetStatus,
  CashMovementCategory,
  ImportRecordType,
  OrganizationNodeType,
  SpendLimitStatus,
} from '@finora/platform';

export const CreateAgentSkillSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(300),
  instructions: z.string().trim().min(20).max(4000),
  allowedTools: z.array(z.string().trim().min(1)).min(1).max(12),
});

export const UpdateAgentSkillSchema = z.object({
  status: z.nativeEnum(AgentSkillStatus),
});

export const CreateOrganizationNodeSchema = z.object({
  parentId: z.string().cuid().optional(),
  memberUserId: z.string().min(1).optional(),
  ownerUserId: z.string().min(1).optional(),
  type: z.nativeEnum(OrganizationNodeType),
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/),
});

export const UpdateOrganizationNodeSchema = z.object({
  parentId: z.string().cuid().nullable().optional(),
  memberUserId: z.string().min(1).nullable().optional(),
  ownerUserId: z.string().min(1).nullable().optional(),
  type: z.nativeEnum(OrganizationNodeType).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/)
    .optional(),
  active: z.boolean().optional(),
  version: z.number().int().positive(),
});

export const UpsertSpendLimitSchema = z
  .object({
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.string().length(3).default('INR'),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    status: z.nativeEnum(SpendLimitStatus).default(SpendLimitStatus.ACTIVE),
    version: z.number().int().positive().optional(),
    categoryLimits: z
      .array(
        z.object({
          category: z.nativeEnum(CashMovementCategory),
          amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
        }),
      )
      .max(20)
      .default([]),
  })
  .refine((value) => value.periodEnd > value.periodStart, {
    message: 'The spend-limit end date must be after its start date.',
    path: ['periodEnd'],
  });

export const FinanceImportSchema = z.object({
  type: z.nativeEnum(ImportRecordType),
});

export const ReceiptCategorySchema = z.object({
  category: z.nativeEnum(CashMovementCategory).optional(),
});

export const ReviewExpenseSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().min(3).max(500),
  version: z.number().int().positive(),
});

export const CreateBudgetSchema = z
  .object({
    nodeId: z.string().cuid(),
    name: z.string().trim().min(3).max(120),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.string().length(3).default('INR'),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    status: z.nativeEnum(BudgetStatus).default(BudgetStatus.DRAFT),
  })
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: 'Budget periodEnd must be on or after periodStart.',
    path: ['periodEnd'],
  });

export const RegisterReceiptSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  storageKey: z.string().trim().min(1).max(500),
  sha256: z.string().trim().min(32).max(128),
  sourceExternalId: z.string().trim().max(180).optional(),
  category: z.nativeEnum(CashMovementCategory).optional(),
  categorySource: z.enum(['USER', 'AI', 'RULE']).optional(),
  categoryStatus: z.enum(['SUGGESTED', 'CONFIRMED', 'NEEDS_REVIEW']).optional(),
  categoryConfidence: z.number().min(0).max(1).optional(),
  categoryReason: z.string().max(240).optional(),
});

export type CreateAgentSkillInput = z.infer<typeof CreateAgentSkillSchema>;
export type CreateOrganizationNodeInput = z.infer<typeof CreateOrganizationNodeSchema>;
export type UpdateOrganizationNodeInput = z.infer<typeof UpdateOrganizationNodeSchema>;
export type UpsertSpendLimitInput = z.infer<typeof UpsertSpendLimitSchema>;
export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>;
export type RegisterReceiptInput = z.infer<typeof RegisterReceiptSchema>;
export type ReviewExpenseInput = z.infer<typeof ReviewExpenseSchema>;
