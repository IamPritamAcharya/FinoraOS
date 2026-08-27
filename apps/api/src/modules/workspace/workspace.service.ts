import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  WorkspacePermission,
  RequestPrincipalSchema,
  formatInr,
  hasWorkspacePermission,
  money,
  type RequestPrincipal,
} from '@finora/platform';
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
import type {
  CreateAgentSkillInput,
  CreateBudgetInput,
  CreateOrganizationNodeInput,
  RegisterReceiptInput,
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
    if (input.memberUserId) {
      const member = await this.prisma.user.findFirst({
        where: { id: input.memberUserId, organizationId: principal.organizationId },
        select: { id: true },
      });
      if (!member) throw new NotFoundException('Organization member not found.');
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
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.financialDocument.create({
        data: {
          organizationId: principal.organizationId,
          expenseClaimId: expense.id,
          uploadedById: principal.userId,
          type: 'RECEIPT',
          status: 'UPLOADED',
          ...input,
        },
      });
      await tx.expenseClaim.update({
        where: { id: expense.id },
        data: {
          status: expense.status === 'RECEIPT_REQUIRED' ? 'SUBMITTED' : expense.status,
          submittedAt: expense.submittedAt ?? new Date(),
        },
      });
      await tx.receiptRequest.updateMany({
        where: { organizationId: principal.organizationId, expenseClaimId: expense.id },
        data: { status: 'RECEIVED' },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'RECEIPT_REGISTERED',
          entityType: 'ExpenseClaim',
          entityId: expense.id,
          details: { documentId: document.id, sha256: document.sha256 },
        },
      });
      return document;
    });
  }

  async uploadReceipt(
    principal: RequestPrincipal,
    expenseExternalId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
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
    });
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
              actionUrl: `/expenses?id=${request.expenseClaim.externalId}`,
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
