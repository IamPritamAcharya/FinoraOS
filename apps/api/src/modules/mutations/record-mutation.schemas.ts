import {
  CashDirection,
  CashMovementCategory,
  CashMovementStatus,
  FinancialRecordType,
  InvoiceDirection,
  MutationOperation,
  RecordMutationRequestSchema,
} from '@finora/platform';
import { z } from 'zod';

const decimal = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, 'Use a non-negative decimal with up to 2 places.'));
const currency = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());
const date = z.union([z.string(), z.date()]).transform((value) => new Date(value));
const nullableText = z.union([z.string().trim().max(500), z.null()]);

export const editableFields = {
  [FinancialRecordType.TRANSACTION]: z.object({
    amount: decimal.optional(),
    currency: currency.optional(),
    status: z.enum(['CAPTURED', 'REFUNDED', 'PENDING']).optional(),
    occurredAt: date.optional(),
    settlementId: nullableText.optional(),
  }),
  [FinancialRecordType.SETTLEMENT]: z.object({
    expectedAmount: decimal.optional(),
    receivedAmount: decimal.optional(),
    feeAmount: decimal.optional(),
    gstAmount: decimal.optional(),
    refundAmount: decimal.optional(),
    settledAt: date.optional(),
  }),
  [FinancialRecordType.INVOICE]: z.object({
    amount: decimal.optional(),
    currency: currency.optional(),
    issuedAt: date.optional(),
    dueAt: z.union([date, z.null()]).optional(),
    direction: z.nativeEnum(InvoiceDirection).optional(),
    nodeId: nullableText.optional(),
    vendor: nullableText.optional(),
    category: z.union([z.nativeEnum(CashMovementCategory), z.null()]).optional(),
    status: z.string().trim().min(1).max(40).optional(),
  }),
  [FinancialRecordType.TAX_LINE]: z.object({
    invoiceId: nullableText.optional(),
    amount: decimal.optional(),
    taxRate: decimal.optional(),
    matched: z.boolean().optional(),
    matchStatus: z.enum(['MATCHED', 'AMBIGUOUS', 'UNMATCHED', 'NEEDS_REVIEW']).optional(),
    taxType: z.string().trim().min(1).max(40).optional(),
    taxPeriod: nullableText.optional(),
    counterpartyTaxId: nullableText.optional(),
  }),
  [FinancialRecordType.CASH_MOVEMENT]: z.object({
    direction: z.nativeEnum(CashDirection).optional(),
    category: z.nativeEnum(CashMovementCategory).optional(),
    status: z.nativeEnum(CashMovementStatus).optional(),
    amount: decimal.optional(),
    currency: currency.optional(),
    description: z.string().trim().min(1).max(500).optional(),
    counterparty: nullableText.optional(),
    occurredAt: date.optional(),
  }),
  [FinancialRecordType.EXPENSE_CLAIM]: z.object({
    amount: decimal.optional(),
    currency: currency.optional(),
    merchant: z.string().trim().min(1).max(200).optional(),
    category: z.nativeEnum(CashMovementCategory).optional(),
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
    incurredAt: date.optional(),
    description: z.string().trim().min(1).max(500).optional(),
    nodeId: z.string().trim().min(1).optional(),
  }),
} as const;

export const parseRecordMutation = (input: unknown) => {
  const request = RecordMutationRequestSchema.parse(input);
  const changes = editableFields[request.entityType].strict().parse(request.changes);
  return { ...request, operation: MutationOperation.UPDATE, changes };
};

const commonCreate = {
  externalId: z.string().trim().min(1).max(128),
};

export const CreateFinancialRecordSchema = z.discriminatedUnion('entityType', [
  z.object({
    entityType: z.literal(FinancialRecordType.TRANSACTION),
    data: z.object({
      ...commonCreate,
      amount: decimal,
      currency: currency.default('INR'),
      status: z.enum(['CAPTURED', 'REFUNDED', 'PENDING']).default('CAPTURED'),
      occurredAt: date,
      settlementId: nullableText.optional(),
    }),
  }),
  z.object({
    entityType: z.literal(FinancialRecordType.SETTLEMENT),
    data: z.object({
      ...commonCreate,
      expectedAmount: decimal,
      receivedAmount: decimal,
      feeAmount: decimal.default('0'),
      gstAmount: decimal.default('0'),
      refundAmount: decimal.default('0'),
      settledAt: date,
    }),
  }),
  z.object({
    entityType: z.literal(FinancialRecordType.INVOICE),
    data: z.object({
      ...commonCreate,
      amount: decimal,
      currency: currency.default('INR'),
      issuedAt: date,
      dueAt: z.union([date, z.null()]).optional(),
      direction: z.nativeEnum(InvoiceDirection).default(InvoiceDirection.PAYABLE),
      nodeId: nullableText.optional(),
      vendor: nullableText.optional(),
      category: z.union([z.nativeEnum(CashMovementCategory), z.null()]).optional(),
      status: z.string().trim().min(1).max(40).default('OPEN'),
    }),
  }),
  z.object({
    entityType: z.literal(FinancialRecordType.TAX_LINE),
    data: z.object({
      ...commonCreate,
      invoiceId: nullableText.optional(),
      amount: decimal,
      taxRate: decimal,
      matched: z.boolean().default(false),
      matchStatus: z
        .enum(['MATCHED', 'AMBIGUOUS', 'UNMATCHED', 'NEEDS_REVIEW'])
        .default('UNMATCHED'),
      taxType: z.string().trim().min(1).max(40).default('GST'),
      taxPeriod: nullableText.optional(),
      counterpartyTaxId: nullableText.optional(),
    }),
  }),
  z.object({
    entityType: z.literal(FinancialRecordType.CASH_MOVEMENT),
    data: z.object({
      ...commonCreate,
      accountId: z.string().trim().min(1),
      direction: z.nativeEnum(CashDirection),
      category: z.nativeEnum(CashMovementCategory),
      status: z.nativeEnum(CashMovementStatus).default(CashMovementStatus.POSTED),
      amount: decimal,
      currency: currency.default('INR'),
      description: z.string().trim().min(1).max(500),
      counterparty: nullableText.optional(),
      occurredAt: date,
    }),
  }),
  z.object({
    entityType: z.literal(FinancialRecordType.EXPENSE_CLAIM),
    data: z.object({
      ...commonCreate,
      claimantUserId: z.string().trim().min(1),
      nodeId: z.string().trim().min(1),
      amount: decimal,
      currency: currency.default('INR'),
      merchant: z.string().trim().min(1).max(200),
      category: z.nativeEnum(CashMovementCategory).default(CashMovementCategory.OTHER),
      status: z.enum(['DRAFT', 'RECEIPT_REQUIRED', 'SUBMITTED', 'UNDER_REVIEW']).default('DRAFT'),
      incurredAt: date,
      description: z.string().trim().min(1).max(500),
    }),
  }),
]);

export type ParsedRecordMutation = ReturnType<typeof parseRecordMutation>;
export type CreateFinancialRecordInput = z.infer<typeof CreateFinancialRecordSchema>;
