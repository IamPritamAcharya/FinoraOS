import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementCategory,
  ImportBatchStatus,
  ImportRecordType,
  WorkspacePermission,
  WorkspaceRole,
  RequestPrincipalSchema,
  formatInr,
  hasWorkspacePermission,
  money,
  type RequestPrincipal,
} from '@finora/platform';
import {
  evaluateSpend,
  validateSpendLimit,
  type SpendLimitInput,
  type NodeSpendInput,
} from '@finora/spend-policy';
import { ExpenseCategorizationAgent } from '@finora/agents';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../prisma/prisma.service.js';
import { createHash } from 'node:crypto';
import {
  DOCUMENT_STORAGE_GATEWAY,
  type DocumentStorageGateway,
} from '../../gateways/document-storage/document-storage.gateway.js';
import {
  MESSAGING_GATEWAY,
  type MessagingGateway,
} from '../../gateways/messaging/messaging.gateway.js';
import { AI_GATEWAY, type AiGateway } from '../../gateways/ai/ai.gateway.js';
import type {
  CreateAgentSkillInput,
  CreateBudgetInput,
  CreateOrganizationNodeInput,
  RegisterReceiptInput,
  ReviewExpenseInput,
  UpdateOrganizationNodeInput,
  UpsertSpendLimitInput,
} from './workspace.schemas.js';

const allowedSkillTools = new Set([
  'getCurrentUser',
  'getOrganizationSummary',
  'getBudgetSummary',
  'getPaymentSummary',
  'getSettlementSummary',
  'getInvoiceSummary',
  'getTaxSummary',
  'getExpenseSummary',
  'findCashMovements',
  'findTransactions',
  'getTransaction',
  'findSettlements',
  'findInvoices',
  'getSettlement',
  'getException',
  'getExceptionEvidence',
  'findExceptions',
  'getCashForecast',
  'findUnmatchedTaxLines',
  'getExpenseClaim',
  'getReceiptRequest',
  'proposeReceiptReminder',
]);

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGING_GATEWAY) private readonly messaging: MessagingGateway,
    @Inject(DOCUMENT_STORAGE_GATEWAY) private readonly documents: DocumentStorageGateway,
    @Inject(AI_GATEWAY) private readonly ai: AiGateway,
  ) {}

  private require(principal: RequestPrincipal, permission: WorkspacePermission) {
    if (!hasWorkspacePermission(principal, permission)) {
      throw new ForbiddenException(`This workspace role cannot ${permission.toLowerCase()}.`);
    }
  }

  async organization(principal: RequestPrincipal) {
    this.require(principal, WorkspacePermission.VIEW_ORGANIZATION_FINANCE);
    const nodes = await this.prisma.organizationNode.findMany({
      where: { organizationId: principal.organizationId },
      include: {
        memberUser: { select: { id: true, name: true, email: true, role: true } },
        ownerUser: { select: { id: true, name: true, email: true, role: true } },
        spendLimits: {
          include: { categoryLimits: { orderBy: { category: 'asc' } } },
          orderBy: { periodStart: 'desc' },
        },
        budgets: {
          include: {
            expenseClaims: {
              where: { status: { notIn: ['DRAFT', 'REJECTED'] } },
              select: { amount: true, status: true },
            },
          },
          orderBy: { periodStart: 'desc' },
        },
      },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });
    return nodes.map((node) => ({
      ...node,
      budgets: node.budgets.map((budget) => ({
        ...budget,
        committedAmount: budget.expenseClaims
          .reduce((sum, claim) => sum.plus(claim.amount.toString()), money('0'))
          .toFixed(2),
        approvedAmount: budget.expenseClaims
          .filter((claim) => claim.status === 'APPROVED' || claim.status === 'REIMBURSED')
          .reduce((sum, claim) => sum.plus(claim.amount.toString()), money('0'))
          .toFixed(2),
        expenseClaims: undefined,
      })),
    }));
  }

  async createOrganizationNode(principal: RequestPrincipal, input: CreateOrganizationNodeInput) {
    this.require(principal, WorkspacePermission.MANAGE_ORGANIZATION);
    if (input.parentId) {
      const parent = await this.prisma.organizationNode.findFirst({
        where: { id: input.parentId, organizationId: principal.organizationId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Parent organization node not found.');
    }
    if (input.memberUserId || input.ownerUserId) {
      const userIds = [input.memberUserId, input.ownerUserId].filter(Boolean) as string[];
      const member = await this.prisma.user.findFirst({
        where: { id: { in: userIds }, organizationId: principal.organizationId },
        select: { id: true },
      });
      const count = await this.prisma.user.count({
        where: { id: { in: userIds }, organizationId: principal.organizationId },
      });
      if (!member || count !== new Set(userIds).size)
        throw new NotFoundException('Organization member or owner not found.');
    }
    return this.prisma.$transaction(async (tx) => {
      const node = await tx.organizationNode.create({
        data: { ...input, organizationId: principal.organizationId },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'ORGANIZATION_NODE_CREATED',
          entityType: 'OrganizationNode',
          entityId: node.id,
          details: { name: node.name, code: node.code, type: node.type, parentId: node.parentId },
        },
      });
      return node;
    });
  }

  async updateOrganizationNode(
    principal: RequestPrincipal,
    id: string,
    input: UpdateOrganizationNodeInput,
  ) {
    this.require(principal, WorkspacePermission.MANAGE_ORGANIZATION);
    const nodes = await this.prisma.organizationNode.findMany({
      where: { organizationId: principal.organizationId },
      select: { id: true, parentId: true, version: true, name: true, code: true },
    });
    const current = nodes.find((node) => node.id === id);
    if (!current) throw new NotFoundException('Organization node not found.');
    if (input.parentId === id) throw new BadRequestException('A node cannot be its own parent.');
    if (input.parentId) {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      let parent = byId.get(input.parentId);
      if (!parent) throw new NotFoundException('Parent organization node not found.');
      while (parent) {
        if (parent.id === id)
          throw new BadRequestException(
            'That change would create a cycle in the organization hierarchy.',
          );
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
    }
    const userIds = [input.memberUserId, input.ownerUserId].filter(Boolean) as string[];
    if (userIds.length) {
      const count = await this.prisma.user.count({
        where: { id: { in: userIds }, organizationId: principal.organizationId },
      });
      if (count !== new Set(userIds).size)
        throw new NotFoundException('Organization member or owner not found.');
    }
    const { version, ...changes } = input;
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.organizationNode.updateMany({
        where: { id, organizationId: principal.organizationId, version },
        data: { ...changes, version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException(
          'This node changed while you were editing it. Refresh and try again.',
        );
      const updated = await tx.organizationNode.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'ORGANIZATION_NODE_UPDATED',
          entityType: 'OrganizationNode',
          entityId: id,
          details: { before: current, after: updated, changedFields: Object.keys(changes) },
        },
      });
      return updated;
    });
  }

  private async policyState(organizationId: string, periodStart: Date, periodEnd: Date) {
    const [limits, claims, invoices] = await Promise.all([
      this.prisma.spendLimit.findMany({
        where: { organizationId, status: 'ACTIVE', periodStart, periodEnd },
        include: { node: { select: { parentId: true } }, categoryLimits: true },
      }),
      this.prisma.expenseClaim.findMany({
        where: {
          organizationId,
          status: { notIn: ['DRAFT', 'REJECTED'] },
          incurredAt: { gte: periodStart, lt: periodEnd },
        },
        select: { nodeId: true, amount: true, currency: true, category: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          direction: 'PAYABLE',
          nodeId: { not: null },
          issuedAt: { gte: periodStart, lt: periodEnd },
          status: { not: 'VOID' },
        },
        select: { nodeId: true, amount: true, currency: true, category: true },
      }),
    ]);
    const mappedLimits: SpendLimitInput[] = limits.map((limit) => ({
      id: limit.id,
      nodeId: limit.nodeId,
      parentNodeId: limit.node.parentId,
      amount: limit.amount.toFixed(2),
      currency: limit.currency,
      periodStart: limit.periodStart.toISOString(),
      periodEnd: limit.periodEnd.toISOString(),
      categoryLimits: limit.categoryLimits.map((item) => ({
        category: item.category,
        amount: item.amount.toFixed(2),
      })),
    }));
    const spend: NodeSpendInput[] = [
      ...claims.map((item) => ({
        nodeId: item.nodeId,
        amount: item.amount.toFixed(2),
        currency: item.currency,
        category: item.category,
      })),
      ...invoices
        .filter((item): item is typeof item & { nodeId: string } => Boolean(item.nodeId))
        .map((item) => ({
          nodeId: item.nodeId,
          amount: item.amount.toFixed(2),
          currency: item.currency,
          category: item.category ?? CashMovementCategory.OTHER,
        })),
    ];
    return { limits: mappedLimits, spend };
  }

  async upsertSpendLimit(
    principal: RequestPrincipal,
    nodeId: string,
    input: UpsertSpendLimitInput,
  ) {
    this.require(principal, WorkspacePermission.MANAGE_SPEND_LIMIT);
    const node = await this.prisma.organizationNode.findFirst({
      where: { id: nodeId, organizationId: principal.organizationId },
      select: { id: true, parentId: true, name: true },
    });
    if (!node) throw new NotFoundException('Organization node not found.');
    if (
      new Set(input.categoryLimits.map((item) => item.category)).size !==
      input.categoryLimits.length
    ) {
      throw new BadRequestException('Each category can only have one soft limit.');
    }
    const existing = await this.prisma.spendLimit.findFirst({
      where: {
        nodeId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency: input.currency.toUpperCase(),
      },
    });
    if (existing && input.version && existing.version !== input.version) {
      throw new ConflictException(
        'This spend limit changed while you were editing it. Refresh and try again.',
      );
    }
    const state = await this.policyState(
      principal.organizationId,
      input.periodStart,
      input.periodEnd,
    );
    const proposed: SpendLimitInput = {
      id: existing?.id ?? `proposed:${nodeId}`,
      nodeId,
      parentNodeId: node.parentId,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
      categoryLimits: input.categoryLimits,
    };
    const evaluation = validateSpendLimit({ proposed, limits: state.limits, spend: state.spend });
    if (!evaluation.allowed)
      throw new BadRequestException(evaluation.violations.map((item) => item.message).join(' '));
    return this.prisma.$transaction(async (tx) => {
      const limit = existing
        ? await tx.spendLimit.update({
            where: { id: existing.id },
            data: {
              amount: input.amount,
              status: input.status,
              updatedById: principal.userId,
              version: { increment: 1 },
              categoryLimits: { deleteMany: {}, create: input.categoryLimits },
            },
            include: { categoryLimits: true },
          })
        : await tx.spendLimit.create({
            data: {
              organizationId: principal.organizationId,
              nodeId,
              createdById: principal.userId,
              updatedById: principal.userId,
              amount: input.amount,
              currency: input.currency.toUpperCase(),
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              status: input.status,
              categoryLimits: { create: input.categoryLimits },
            },
            include: { categoryLimits: true },
          });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: existing ? 'SPEND_LIMIT_UPDATED' : 'SPEND_LIMIT_CREATED',
          entityType: 'SpendLimit',
          entityId: limit.id,
          details: {
            nodeId,
            amount: limit.amount.toFixed(2),
            currency: limit.currency,
            categoryLimits: limit.categoryLimits,
          },
        },
      });
      return limit;
    });
  }

  async createBudget(principal: RequestPrincipal, input: CreateBudgetInput) {
    this.require(principal, WorkspacePermission.MANAGE_BUDGET);
    const node = await this.prisma.organizationNode.findFirst({
      where: { id: input.nodeId, organizationId: principal.organizationId },
      select: { id: true },
    });
    if (!node) throw new NotFoundException('Organization node not found.');
    return this.prisma.$transaction(async (tx) => {
      const budget = await tx.budget.create({
        data: {
          ...input,
          currency: input.currency.toUpperCase(),
          organizationId: principal.organizationId,
          createdById: principal.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'BUDGET_CREATED',
          entityType: 'Budget',
          entityId: budget.id,
          details: {
            nodeId: budget.nodeId,
            amount: budget.amount.toFixed(2),
            currency: budget.currency,
            periodStart: budget.periodStart,
            periodEnd: budget.periodEnd,
          },
        },
      });
      return budget;
    });
  }

  expenses(principal: RequestPrincipal) {
    const canViewOrganization = hasWorkspacePermission(
      principal,
      WorkspacePermission.VIEW_ORGANIZATION_FINANCE,
    );
    return this.prisma.expenseClaim.findMany({
      where: {
        organizationId: principal.organizationId,
        ...(canViewOrganization ? {} : { claimantUserId: principal.userId }),
      },
      include: {
        claimant: { select: { name: true, email: true } },
        node: { select: { name: true, code: true } },
        budget: { select: { name: true } },
        documents: {
          select: { id: true, fileName: true, mimeType: true, status: true, createdAt: true },
        },
        receiptRequests: {
          select: { id: true, status: true, channel: true, dueAt: true, attempts: true },
        },
      },
      orderBy: { incurredAt: 'desc' },
    });
  }

  async reviewExpense(
    principal: RequestPrincipal,
    expenseExternalId: string,
    input: ReviewExpenseInput,
  ) {
    this.require(principal, WorkspacePermission.REVIEW_EXPENSE);
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expenseClaim.findFirst({
        where: {
          organizationId: principal.organizationId,
          externalId: expenseExternalId,
        },
        include: {
          documents: { select: { id: true } },
          claimant: { select: { id: true, name: true } },
        },
      });
      if (!expense) throw new NotFoundException('Expense claim not found.');
      if (!['SUBMITTED', 'UNDER_REVIEW'].includes(expense.status)) {
        throw new ConflictException('Only submitted expenses can be reviewed.');
      }
      if (input.decision === 'APPROVE' && !expense.documents.length) {
        throw new BadRequestException('A receipt is required before approving this expense.');
      }
      const status = input.decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const);
      const updated = await tx.expenseClaim.updateMany({
        where: {
          id: expense.id,
          organizationId: principal.organizationId,
          version: input.version,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        },
        data: {
          status,
          approvedById: input.decision === 'APPROVE' ? principal.userId : null,
          approvedAt: input.decision === 'APPROVE' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'This expense changed while you were reviewing it. Refresh and try again.',
        );
      }
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: input.decision === 'APPROVE' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
          entityType: 'ExpenseClaim',
          entityId: expense.id,
          details: {
            externalId: expense.externalId,
            beforeStatus: expense.status,
            afterStatus: status,
            reason: input.reason,
            documentIds: expense.documents.map((document) => document.id),
          },
        },
      });
      await tx.notification.create({
        data: {
          organizationId: principal.organizationId,
          userId: expense.claimant.id,
          type: `EXPENSE_${status}`,
          status: 'SENT',
          title: `${expense.externalId} ${status === 'APPROVED' ? 'approved' : 'rejected'}`,
          body: input.reason,
          actionUrl: `/records?tab=expense-claims&record=${expense.externalId}`,
          entityType: 'ExpenseClaim',
          entityId: expense.id,
          dedupeKey: `expense-review:${expense.id}:${input.version}:${status}`,
          sentAt: new Date(),
        },
      });
      return tx.expenseClaim.findUnique({
        where: { id: expense.id },
        include: {
          claimant: { select: { id: true, name: true, email: true } },
          node: { select: { id: true, name: true, code: true } },
          budget: { select: { id: true, name: true } },
          documents: {
            select: { id: true, fileName: true, mimeType: true, status: true, createdAt: true },
          },
          receiptRequests: {
            select: { id: true, status: true, channel: true, dueAt: true, attempts: true },
          },
        },
      });
    });
  }

  private async categorizeExpense(input: {
    merchant: string;
    description: string;
    fileName?: string;
  }) {
    const text = `${input.merchant} ${input.description} ${input.fileName ?? ''}`.toLowerCase();
    const rules: Array<[RegExp, CashMovementCategory]> = [
      [/hotel|lodg|airbnb/, CashMovementCategory.LODGING],
      [/flight|airline|indigo|vistara|train/, CashMovementCategory.TRAVEL],
      [/uber|ola|cab|taxi|metro/, CashMovementCategory.LOCAL_TRANSPORT],
      [/restaurant|cafe|meal|food|swiggy|zomato/, CashMovementCategory.MEALS],
      [/software|saas|subscription|github|notion|aws|cloud/, CashMovementCategory.SOFTWARE],
      [/stationery|office supplies|printer/, CashMovementCategory.OFFICE_SUPPLIES],
      [/marketing|advertising|campaign/, CashMovementCategory.MARKETING],
      [/consult|legal|professional/, CashMovementCategory.PROFESSIONAL_SERVICES],
      [/electric|internet|utility|utilities/, CashMovementCategory.UTILITIES],
    ];
    const rule = rules.find(([pattern]) => pattern.test(text));
    if (rule)
      return {
        category: rule[1],
        source: 'RULE' as const,
        status: 'CONFIRMED' as const,
        confidence: 0.99,
        reason: 'Matched a controlled merchant/description rule.',
      };
    try {
      const result = await new ExpenseCategorizationAgent(this.ai).categorize(input);
      return {
        category: result.category as CashMovementCategory,
        source: 'AI' as const,
        status: result.confidence >= 0.8 ? ('SUGGESTED' as const) : ('NEEDS_REVIEW' as const),
        confidence: result.confidence,
        reason: result.reason,
        provider: result.provider,
        model: result.model,
      };
    } catch {
      return {
        category: CashMovementCategory.OTHER,
        source: 'AI' as const,
        status: 'NEEDS_REVIEW' as const,
        confidence: 0,
        reason: 'Automatic categorization was unavailable; a person must choose a category.',
      };
    }
  }

  async registerReceipt(
    principal: RequestPrincipal,
    expenseExternalId: string,
    input: RegisterReceiptInput,
  ) {
    const expense = await this.prisma.expenseClaim.findFirst({
      where: {
        externalId: expenseExternalId,
        organizationId: principal.organizationId,
        ...(hasWorkspacePermission(principal, WorkspacePermission.REVIEW_EXPENSE)
          ? {}
          : { claimantUserId: principal.userId }),
      },
    });
    if (!expense) throw new NotFoundException('Expense claim not found.');
    const warningData = input.category
      ? await this.categoryWarningData(principal.organizationId, expense, input.category)
      : [];
    const {
      category,
      categorySource,
      categoryStatus,
      categoryConfidence,
      categoryReason,
      ...documentInput
    } = input;
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.financialDocument.create({
        data: {
          organizationId: principal.organizationId,
          expenseClaimId: expense.id,
          uploadedById: principal.userId,
          type: 'RECEIPT',
          status: 'UPLOADED',
          ...documentInput,
        },
      });
      await tx.expenseClaim.update({
        where: { id: expense.id },
        data: {
          status: expense.status === 'RECEIPT_REQUIRED' ? 'SUBMITTED' : expense.status,
          submittedAt: expense.submittedAt ?? new Date(),
          ...(category
            ? {
                category,
                categorySource,
                categoryStatus,
                categoryConfidence,
                categoryReason,
              }
            : {}),
        },
      });
      await tx.receiptRequest.updateMany({
        where: { organizationId: principal.organizationId, expenseClaimId: expense.id },
        data: { status: 'RECEIVED' },
      });
      if (warningData.length)
        await tx.notification.createMany({ data: warningData, skipDuplicates: true });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'RECEIPT_REGISTERED',
          entityType: 'ExpenseClaim',
          entityId: expense.id,
          details: {
            documentId: document.id,
            sha256: document.sha256,
            category,
            categoryWarnings: warningData.length,
          },
        },
      });
      return document;
    });
  }

  private async categoryWarningData(
    organizationId: string,
    expense: {
      id: string;
      nodeId: string;
      amount: { toFixed(digits: number): string };
      currency: string;
      incurredAt: Date;
    },
    category: CashMovementCategory,
  ) {
    const limits = await this.prisma.spendLimit.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        periodStart: { lte: expense.incurredAt },
        periodEnd: { gt: expense.incurredAt },
        currency: expense.currency,
      },
      include: { node: { select: { parentId: true } }, categoryLimits: true },
    });
    if (!limits.length) return [];
    const start = limits.reduce(
      (value, item) => (item.periodStart < value ? item.periodStart : value),
      limits[0].periodStart,
    );
    const end = limits.reduce(
      (value, item) => (item.periodEnd > value ? item.periodEnd : value),
      limits[0].periodEnd,
    );
    const [claims, invoices] = await Promise.all([
      this.prisma.expenseClaim.findMany({
        where: {
          organizationId,
          id: { not: expense.id },
          status: { notIn: ['DRAFT', 'REJECTED'] },
          incurredAt: { gte: start, lt: end },
        },
        select: { nodeId: true, amount: true, currency: true, category: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          direction: 'PAYABLE',
          status: { not: 'VOID' },
          nodeId: { not: null },
          issuedAt: { gte: start, lt: end },
        },
        select: { nodeId: true, amount: true, currency: true, category: true },
      }),
    ]);
    const policy = evaluateSpend({
      nodeId: expense.nodeId,
      amount: expense.amount.toFixed(2),
      currency: expense.currency,
      category,
      limits: limits.map((limit) => ({
        id: limit.id,
        nodeId: limit.nodeId,
        parentNodeId: limit.node.parentId,
        amount: limit.amount.toFixed(2),
        currency: limit.currency,
        periodStart: limit.periodStart.toISOString(),
        periodEnd: limit.periodEnd.toISOString(),
        categoryLimits: limit.categoryLimits.map((item) => ({
          category: item.category,
          amount: item.amount.toFixed(2),
        })),
      })),
      spend: [
        ...claims.map((item) => ({
          nodeId: item.nodeId,
          amount: item.amount.toFixed(2),
          currency: item.currency,
          category: item.category,
        })),
        ...invoices
          .filter((item): item is typeof item & { nodeId: string } => Boolean(item.nodeId))
          .map((item) => ({
            nodeId: item.nodeId,
            amount: item.amount.toFixed(2),
            currency: item.currency,
            category: item.category ?? CashMovementCategory.OTHER,
          })),
      ],
    });
    return this.warningRecipients(organizationId, policy.warnings);
  }

  async uploadReceipt(
    principal: RequestPrincipal,
    expenseExternalId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    selectedCategory?: CashMovementCategory,
  ) {
    this.require(principal, WorkspacePermission.SUBMIT_EXPENSE);
    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.mimetype)) {
      throw new ForbiddenException('Receipts must be PDF, JPEG, PNG, or WebP files.');
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      throw new ForbiddenException('Receipts must be between 1 byte and 10 MB.');
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const expense = await this.prisma.expenseClaim.findFirst({
      where: { externalId: expenseExternalId, organizationId: principal.organizationId },
      select: { merchant: true, description: true },
    });
    if (!expense) throw new NotFoundException('Expense claim not found.');
    const categorization = selectedCategory
      ? {
          category: selectedCategory,
          source: 'USER' as const,
          status: 'CONFIRMED' as const,
          confidence: 1,
          reason: 'Selected by the uploader.',
        }
      : await this.categorizeExpense({ ...expense, fileName: file.originalname });
    const stored = await this.documents.store({
      organizationId: principal.organizationId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sha256,
      bytes: file.buffer,
    });
    return this.registerReceipt(principal, expenseExternalId, {
      fileName: file.originalname,
      mimeType: file.mimetype as RegisterReceiptInput['mimeType'],
      sizeBytes: stored.sizeBytes,
      storageKey: stored.storageKey,
      sha256,
      category: categorization.category,
      categorySource: categorization.source,
      categoryStatus: categorization.status,
      categoryConfidence: categorization.confidence,
      categoryReason: categorization.reason,
    });
  }

  imports(principal: RequestPrincipal) {
    this.require(principal, WorkspacePermission.VIEW_ORGANIZATION_FINANCE);
    return this.prisma.importBatch.findMany({
      where: { organizationId: principal.organizationId },
      include: { uploadedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private async warningRecipients(
    organizationId: string,
    warnings: Array<{
      nodeId: string;
      limitId: string;
      category: string;
      limitAmount: string;
      projectedAmount: string;
      overBy: string;
    }>,
  ) {
    if (!warnings.length) return [];
    const [financeUsers, nodes] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId,
          role: { in: [WorkspaceRole.FINANCE_CONTROLLER, WorkspaceRole.ENTERPRISE_ADMIN] },
        },
        select: { id: true },
      }),
      this.prisma.organizationNode.findMany({
        where: {
          organizationId,
          id: { in: [...new Set(warnings.map((warning) => warning.nodeId))] },
        },
        select: { id: true, name: true, ownerUserId: true },
      }),
    ]);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const result: Array<{
      organizationId: string;
      userId: string;
      type: string;
      title: string;
      body: string;
      actionUrl: string;
      entityType: string;
      entityId: string;
      dedupeKey: string;
    }> = [];
    const seen = new Set<string>();
    for (const warning of warnings) {
      const node = nodeById.get(warning.nodeId);
      const recipients = new Set(financeUsers.map((user) => user.id));
      if (node?.ownerUserId) recipients.add(node.ownerUserId);
      for (const userId of recipients) {
        const dedupeKey = `category-limit:${warning.limitId}:${warning.category}`;
        const key = `${userId}:${dedupeKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          organizationId,
          userId,
          type: 'CATEGORY_LIMIT_EXCEEDED',
          title: `${warning.category.replaceAll('_', ' ')} limit exceeded`,
          body: `${node?.name ?? 'Organization node'} is ${warning.overBy} INR above its soft category limit. Current spend is ${warning.projectedAmount} INR against ${warning.limitAmount} INR.`,
          actionUrl: `/organization?node=${warning.nodeId}`,
          entityType: 'SpendLimit',
          entityId: warning.limitId,
          dedupeKey,
        });
      }
    }
    return result;
  }

  async importRecords(
    principal: RequestPrincipal,
    type: ImportRecordType,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    this.require(principal, WorkspacePermission.REVIEW_EXPENSE);
    if (!file.originalname.toLowerCase().endsWith('.csv'))
      throw new BadRequestException('Imports must be CSV files.');
    const rawRows = parse(file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
    if (!rawRows.length) throw new BadRequestException('The CSV has no data rows.');
    if (rawRows.length > 500) throw new BadRequestException('Import up to 500 rows at a time.');
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.importBatch.findFirst({
      where: { organizationId: principal.organizationId, sha256, type },
    });
    if (duplicate)
      throw new ConflictException(`This file was already imported as ${duplicate.id}.`);

    const [nodes, users, limits, claims, invoices] = await Promise.all([
      this.prisma.organizationNode.findMany({
        where: { organizationId: principal.organizationId },
        select: { id: true, code: true, parentId: true },
      }),
      this.prisma.user.findMany({
        where: { organizationId: principal.organizationId },
        select: { id: true, email: true },
      }),
      this.prisma.spendLimit.findMany({
        where: { organizationId: principal.organizationId, status: 'ACTIVE' },
        include: { node: { select: { parentId: true } }, categoryLimits: true },
      }),
      this.prisma.expenseClaim.findMany({
        where: {
          organizationId: principal.organizationId,
          status: { notIn: ['DRAFT', 'REJECTED'] },
        },
        select: {
          externalId: true,
          nodeId: true,
          amount: true,
          currency: true,
          category: true,
          incurredAt: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: { organizationId: principal.organizationId },
        select: {
          externalId: true,
          nodeId: true,
          amount: true,
          currency: true,
          category: true,
          issuedAt: true,
          direction: true,
          status: true,
        },
      }),
    ]);
    const nodeByCode = new Map(nodes.map((node) => [node.code.toUpperCase(), node]));
    const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
    const existingIds = new Set(
      type === ImportRecordType.EXPENSE
        ? claims.map((item) => item.externalId)
        : invoices.map((item) => item.externalId),
    );
    const categorySet = new Set(Object.values(CashMovementCategory));
    const accepted: Array<
      Record<string, unknown> & {
        occurredAt: Date;
        nodeId: string;
        amount: string;
        currency: string;
        category: CashMovementCategory;
      }
    > = [];
    const errors: Array<{ row: number; externalId?: string; message: string }> = [];
    const warnings: Array<{
      nodeId: string;
      limitId: string;
      category: string;
      limitAmount: string;
      projectedAmount: string;
      overBy: string;
    }> = [];

    for (const [index, row] of rawRows.entries()) {
      try {
        const externalId = row.externalId?.trim();
        if (!externalId) throw new Error('externalId is required.');
        if (existingIds.has(externalId))
          throw new Error('externalId already exists or is duplicated in this file.');
        const node = nodeByCode.get(row.nodeCode?.toUpperCase());
        if (!node) throw new Error(`Unknown nodeCode ${row.nodeCode || '(blank)'}.`);
        if (
          type === ImportRecordType.EXPENSE &&
          !userByEmail.has(row.employeeEmail?.toLowerCase())
        ) {
          throw new Error(`Unknown employeeEmail ${row.employeeEmail || '(blank)'}.`);
        }
        const amountValue = money(row.amount ?? '');
        if (!amountValue.isPositive()) throw new Error('amount must be greater than zero.');
        const currency = (row.currency || 'INR').toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) throw new Error('currency must be a three-letter code.');
        const occurredAt = new Date(
          type === ImportRecordType.EXPENSE ? row.incurredAt : row.issuedAt,
        );
        if (Number.isNaN(occurredAt.getTime()))
          throw new Error(
            `${type === ImportRecordType.EXPENSE ? 'incurredAt' : 'issuedAt'} must be a valid date.`,
          );
        let category = categorySet.has(row.category as CashMovementCategory)
          ? (row.category as CashMovementCategory)
          : undefined;
        let categorization: Awaited<ReturnType<WorkspaceService['categorizeExpense']>> | undefined;
        if (!category) {
          categorization = await this.categorizeExpense({
            merchant: row.merchant || row.vendor || '',
            description: row.description || '',
            fileName: file.originalname,
          });
          category = categorization.category;
        }
        const activeLimits: SpendLimitInput[] = limits
          .filter(
            (limit) =>
              limit.periodStart <= occurredAt &&
              limit.periodEnd > occurredAt &&
              limit.currency === currency,
          )
          .map((limit) => ({
            id: limit.id,
            nodeId: limit.nodeId,
            parentNodeId: limit.node.parentId,
            amount: limit.amount.toFixed(2),
            currency: limit.currency,
            periodStart: limit.periodStart.toISOString(),
            periodEnd: limit.periodEnd.toISOString(),
            categoryLimits: limit.categoryLimits.map((item) => ({
              category: item.category,
              amount: item.amount.toFixed(2),
            })),
          }));
        const relevantPeriods = activeLimits.map(
          (limit) => [new Date(limit.periodStart), new Date(limit.periodEnd)] as const,
        );
        const existingSpend: NodeSpendInput[] = [
          ...claims
            .filter((item) =>
              relevantPeriods.some(
                ([start, end]) => item.incurredAt >= start && item.incurredAt < end,
              ),
            )
            .map((item) => ({
              nodeId: item.nodeId,
              amount: item.amount.toFixed(2),
              currency: item.currency,
              category: item.category,
            })),
          ...invoices
            .filter(
              (item) =>
                item.direction === 'PAYABLE' &&
                item.status !== 'VOID' &&
                item.nodeId &&
                relevantPeriods.some(
                  ([start, end]) => item.issuedAt >= start && item.issuedAt < end,
                ),
            )
            .map((item) => ({
              nodeId: item.nodeId!,
              amount: item.amount.toFixed(2),
              currency: item.currency,
              category: item.category ?? CashMovementCategory.OTHER,
            })),
          ...accepted
            .filter((item) =>
              relevantPeriods.some(
                ([start, end]) => item.occurredAt >= start && item.occurredAt < end,
              ),
            )
            .map((item) => ({
              nodeId: item.nodeId,
              amount: item.amount,
              currency: item.currency,
              category: item.category,
            })),
        ];
        const consumesLimit = type === ImportRecordType.EXPENSE || row.direction !== 'RECEIVABLE';
        const policy = consumesLimit
          ? evaluateSpend({
              nodeId: node.id,
              amount: amountValue.toFixed(2),
              currency,
              category,
              limits: activeLimits,
              spend: existingSpend,
            })
          : { allowed: true, violations: [], warnings: [] };
        if (!policy.allowed)
          throw new Error(policy.violations.map((item) => item.message).join(' '));
        warnings.push(...policy.warnings);
        existingIds.add(externalId);
        accepted.push({
          ...row,
          externalId,
          nodeId: node.id,
          amount: amountValue.toFixed(2),
          currency,
          category,
          occurredAt,
          categorySource: row.category ? 'IMPORT' : categorization?.source,
          categoryStatus: row.category ? 'CONFIRMED' : categorization?.status,
          categoryConfidence: categorization?.confidence,
          categoryReason: categorization?.reason,
        });
      } catch (error) {
        errors.push({
          row: index + 2,
          externalId: row.externalId,
          message: (error as Error).message,
        });
      }
    }
    const notificationData = await this.warningRecipients(principal.organizationId, warnings);
    const batchStatus = errors.length
      ? ImportBatchStatus.COMPLETED_WITH_ERRORS
      : ImportBatchStatus.COMPLETED;
    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.importBatch.create({
        data: {
          organizationId: principal.organizationId,
          uploadedById: principal.userId,
          type,
          status: batchStatus,
          fileName: file.originalname,
          sha256,
          rowCount: rawRows.length,
          succeededCount: accepted.length,
          failedCount: errors.length,
          errorReport: errors,
          completedAt: new Date(),
        },
      });
      for (const item of accepted) {
        if (type === ImportRecordType.EXPENSE) {
          const claimant = userByEmail.get(String(item.employeeEmail ?? '').toLowerCase());
          if (!claimant)
            throw new BadRequestException(
              `A validated expense row lost claimant ${String(item.employeeEmail)}.`,
            );
          await tx.expenseClaim.create({
            data: {
              organizationId: principal.organizationId,
              externalId: String(item.externalId),
              claimantUserId: claimant.id,
              nodeId: item.nodeId,
              amount: item.amount,
              currency: item.currency,
              merchant: String(item.merchant || 'Unknown merchant'),
              category: item.category,
              categorySource:
                item.categorySource === 'RULE'
                  ? 'RULE'
                  : item.categorySource === 'AI'
                    ? 'AI'
                    : item.categorySource === 'IMPORT'
                      ? 'IMPORT'
                      : 'USER',
              categoryStatus:
                item.categoryStatus === 'SUGGESTED'
                  ? 'SUGGESTED'
                  : item.categoryStatus === 'NEEDS_REVIEW'
                    ? 'NEEDS_REVIEW'
                    : 'CONFIRMED',
              categoryConfidence: item.categoryConfidence as number | undefined,
              categoryReason: item.categoryReason as string | undefined,
              incurredAt: item.occurredAt,
              description: String(item.description || 'Imported expense'),
              sourceType: 'CSV_IMPORT',
              status: 'SUBMITTED',
              submittedAt: new Date(),
              importBatchId: created.id,
            },
          });
        } else {
          const dueAt = item.dueAt ? new Date(String(item.dueAt)) : undefined;
          await tx.invoice.create({
            data: {
              organizationId: principal.organizationId,
              externalId: String(item.externalId),
              nodeId: item.nodeId,
              amount: item.amount,
              currency: item.currency,
              issuedAt: item.occurredAt,
              dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : undefined,
              direction:
                String(item.direction || 'PAYABLE') === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE',
              vendor: String(item.vendor || 'Unknown vendor'),
              category: item.category,
              sourceMetadata: { source: 'CSV_IMPORT' },
              importBatchId: created.id,
            },
          });
        }
      }
      if (notificationData.length)
        await tx.notification.createMany({ data: notificationData, skipDuplicates: true });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'FINANCE_RECORDS_IMPORTED',
          entityType: 'ImportBatch',
          entityId: created.id,
          details: {
            type,
            rows: rawRows.length,
            succeeded: accepted.length,
            failed: errors.length,
            categoryWarnings: warnings.length,
          },
        },
      });
      return created;
    });
    return { ...batch, errors, warnings, notificationsCreated: notificationData.length };
  }

  skills(principal: RequestPrincipal) {
    this.require(principal, WorkspacePermission.VIEW_AGENT_AUDIT);
    return this.prisma.agentSkill.findMany({
      where: { organizationId: principal.organizationId },
      include: {
        createdBy: { select: { name: true, email: true } },
        _count: { select: { agentRuns: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createSkill(principal: RequestPrincipal, input: CreateAgentSkillInput) {
    this.require(principal, WorkspacePermission.MANAGE_AGENT_SKILL);
    const unsupported = input.allowedTools.filter((tool) => !allowedSkillTools.has(tool));
    if (unsupported.length) {
      throw new ForbiddenException(
        `Skills cannot grant unsupported tools: ${unsupported.join(', ')}`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const skill = await tx.agentSkill.create({
        data: { ...input, organizationId: principal.organizationId, createdById: principal.userId },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'AGENT_SKILL_CREATED',
          entityType: 'AgentSkill',
          entityId: skill.id,
          details: { name: skill.name, allowedTools: skill.allowedTools },
        },
      });
      return skill;
    });
  }

  async updateSkillStatus(
    principal: RequestPrincipal,
    id: string,
    status: 'DRAFT' | 'ACTIVE' | 'DISABLED',
  ) {
    this.require(principal, WorkspacePermission.MANAGE_AGENT_SKILL);
    const skill = await this.prisma.agentSkill.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!skill) throw new NotFoundException('Agent skill not found.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.agentSkill.update({ where: { id }, data: { status } });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'AGENT_SKILL_STATUS_CHANGED',
          entityType: 'AgentSkill',
          entityId: id,
          details: { before: skill.status, after: status },
        },
      });
      return updated;
    });
  }

  async agentAudit(principal: RequestPrincipal) {
    this.require(principal, WorkspacePermission.VIEW_AGENT_AUDIT);
    const [runs, auditEvents] = await Promise.all([
      this.prisma.agentRun.findMany({
        where: { organizationId: principal.organizationId },
        include: {
          skill: { select: { id: true, name: true, version: true } },
          steps: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId: principal.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { runs, auditEvents };
  }

  notifications(principal: RequestPrincipal) {
    return this.prisma.notification.findMany({
      where: { organizationId: principal.organizationId, userId: principal.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markNotificationRead(principal: RequestPrincipal, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, organizationId: principal.organizationId, userId: principal.userId },
      data: { status: 'READ', readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Notification not found.');
    return { id, status: 'READ' };
  }

  async operations(principal: RequestPrincipal) {
    this.require(principal, WorkspacePermission.VIEW_ORGANIZATION_FINANCE);
    const [integrations, jobs, policies] = await Promise.all([
      this.prisma.integrationConnection.findMany({
        where: { organizationId: principal.organizationId },
        orderBy: { type: 'asc' },
      }),
      this.prisma.automationJob.findMany({
        where: { organizationId: principal.organizationId },
        include: { runs: { orderBy: { startedAt: 'desc' }, take: 3 } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.approvalPolicy.findMany({
        where: { organizationId: principal.organizationId },
        include: { node: { select: { name: true, code: true } } },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { integrations, jobs, policies };
  }

  async runReceiptReminderJob(principal: RequestPrincipal, jobId: string) {
    this.require(principal, WorkspacePermission.REVIEW_EXPENSE);
    const job = await this.prisma.automationJob.findFirst({
      where: {
        id: jobId,
        organizationId: principal.organizationId,
        type: 'RECEIPT_REMINDER',
        enabled: true,
      },
    });
    if (!job) throw new NotFoundException('Receipt reminder job not found.');
    const requests = await this.prisma.receiptRequest.findMany({
      where: {
        organizationId: principal.organizationId,
        status: { in: ['PENDING', 'SENT', 'OVERDUE'] },
        nextAttemptAt: { lte: new Date() },
        attempts: { lt: 3 },
      },
      include: { expenseClaim: true, employee: true },
      take: 50,
    });
    const run = await this.prisma.automationJobRun.create({
      data: { jobId, status: 'RUNNING', attempted: requests.length },
    });
    let succeeded = 0;
    let failed = 0;
    for (const request of requests) {
      try {
        const text = `FinoraOS needs the receipt for ${request.expenseClaim.externalId}: ${request.expenseClaim.merchant}, ${formatInr(request.expenseClaim.amount.toString())}. Upload it before ${request.dueAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}.`;
        const delivery = await this.messaging.sendDirectMessage({
          externalUserId: request.employee.slackUserId ?? request.employee.id,
          text,
          metadata: { receiptRequestId: request.id, expenseClaimId: request.expenseClaim.id },
        });
        await this.prisma.$transaction([
          this.prisma.receiptRequest.update({
            where: { id: request.id },
            data: {
              status: 'SENT',
              attempts: { increment: 1 },
              lastSentAt: new Date(),
              nextAttemptAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
              externalThreadId: `${delivery.channelId}:${delivery.messageId}`,
            },
          }),
          this.prisma.notification.create({
            data: {
              organizationId: principal.organizationId,
              userId: request.employeeUserId,
              type: 'RECEIPT_REQUEST',
              channel: delivery.provider === 'slack' ? 'SLACK' : 'IN_APP',
              status: 'SENT',
              title: `Receipt needed for ${request.expenseClaim.externalId}`,
              body: text,
              actionUrl: `/records?tab=expense-claims&record=${request.expenseClaim.externalId}`,
              entityType: 'ExpenseClaim',
              entityId: request.expenseClaim.id,
              sentAt: new Date(),
            },
          }),
        ]);
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    const status = failed ? 'FAILED' : 'COMPLETED';
    await this.prisma.$transaction([
      this.prisma.automationJobRun.update({
        where: { id: run.id },
        data: { status, succeeded, failed, completedAt: new Date() },
      }),
      this.prisma.automationJob.update({
        where: { id: jobId },
        data: {
          status,
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'RECEIPT_REMINDER_JOB_COMPLETED',
          entityType: 'AutomationJob',
          entityId: jobId,
          details: { attempted: requests.length, succeeded, failed },
        },
      }),
    ]);
    return { runId: run.id, attempted: requests.length, succeeded, failed, status };
  }

  async runDueReceiptReminderJobs(asOf = new Date()) {
    const jobs = await this.prisma.automationJob.findMany({
      where: {
        type: 'RECEIPT_REMINDER',
        enabled: true,
        status: { not: 'RUNNING' },
        nextRunAt: { lte: asOf },
      },
      take: 10,
    });
    for (const job of jobs) {
      const operator = await this.prisma.user.findFirst({
        where: {
          organizationId: job.organizationId,
          role: { in: ['FINANCE_OPERATOR', 'FINANCE_CONTROLLER', 'ENTERPRISE_ADMIN'] },
        },
        orderBy: { role: 'asc' },
      });
      if (!operator) continue;
      await this.runReceiptReminderJob(
        RequestPrincipalSchema.parse({
          organizationId: job.organizationId,
          userId: operator.id,
          role: operator.role,
        }),
        job.id,
      );
    }
    return jobs.length;
  }
}
