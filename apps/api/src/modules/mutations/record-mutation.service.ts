import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementCategory,
  FinancialRecordType,
  MutationStatus,
  WorkspacePermission,
  hasWorkspacePermission,
  type RequestPrincipal,
} from '@finora/platform';
import { evaluateSpend } from '@finora/spend-policy';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AgentWriteService } from './agent-write.service.js';
import { CreateFinancialRecordSchema, parseRecordMutation } from './record-mutation.schemas.js';

const plain = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Record<string, Prisma.JsonValue>;

const outputProposal = (proposal: {
  id: string;
  entityType: string;
  entityId: string;
  recordExternalId: string;
  operation: string;
  status: string;
  reason: string;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
  diff: Prisma.JsonValue;
  expiresAt: Date;
}) => ({
  ...proposal,
  expiresAt: proposal.expiresAt.toISOString(),
});

@Injectable()
export class RecordMutationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: AgentWriteService,
    private readonly audit: AuditService,
  ) {}

  private requireManage(principal: RequestPrincipal) {
    if (!hasWorkspacePermission(principal, WorkspacePermission.MANAGE_FINANCE_RECORDS)) {
      throw new ForbiddenException('Your workspace role cannot create or edit finance records.');
    }
  }

  private async findRecord(
    principal: RequestPrincipal,
    entityType: FinancialRecordType,
    recordId: string,
  ) {
    const where = {
      organizationId: principal.organizationId,
      OR: [{ id: recordId }, { externalId: recordId }],
    };
    switch (entityType) {
      case FinancialRecordType.TRANSACTION:
        return this.prisma.transaction.findFirst({ where });
      case FinancialRecordType.SETTLEMENT:
        return this.prisma.settlement.findFirst({ where });
      case FinancialRecordType.INVOICE:
        return this.prisma.invoice.findFirst({ where });
      case FinancialRecordType.TAX_LINE:
        return this.prisma.taxLine.findFirst({ where });
      case FinancialRecordType.CASH_MOVEMENT:
        return this.prisma.cashMovement.findFirst({ where });
      case FinancialRecordType.EXPENSE_CLAIM:
        return this.prisma.expenseClaim.findFirst({ where });
    }
  }

  private async validateReferences(
    principal: RequestPrincipal,
    entityType: FinancialRecordType,
    changes: Record<string, unknown>,
  ) {
    if (typeof changes.nodeId === 'string') {
      const node = await this.prisma.organizationNode.findFirst({
        where: { id: changes.nodeId, organizationId: principal.organizationId },
        select: { id: true },
      });
      if (!node) throw new BadRequestException('The selected organization node is not available.');
    }
    if (typeof changes.settlementId === 'string') {
      const settlement = await this.prisma.settlement.findFirst({
        where: {
          organizationId: principal.organizationId,
          OR: [{ id: changes.settlementId }, { externalId: changes.settlementId }],
        },
        select: { id: true },
      });
      if (!settlement) throw new BadRequestException('The selected settlement is not available.');
      changes.settlementId = settlement.id;
    }
    if (
      entityType === FinancialRecordType.EXPENSE_CLAIM &&
      typeof changes.claimantUserId === 'string'
    ) {
      const user = await this.prisma.user.findFirst({
        where: { id: changes.claimantUserId, organizationId: principal.organizationId },
        select: { id: true },
      });
      if (!user)
        throw new BadRequestException('The selected claimant is not in this organization.');
    }
    if (entityType === FinancialRecordType.CASH_MOVEMENT && typeof changes.accountId === 'string') {
      const account = await this.prisma.cashAccount.findFirst({
        where: { id: changes.accountId, organizationId: principal.organizationId },
        select: { id: true },
      });
      if (!account) throw new BadRequestException('The selected cash account is not available.');
    }
  }

  private async enforceSpendPolicy(
    principal: RequestPrincipal,
    entityType: FinancialRecordType,
    candidate: Record<string, unknown>,
    excludeId?: string,
  ) {
    const invoice = entityType === FinancialRecordType.INVOICE;
    const expense = entityType === FinancialRecordType.EXPENSE_CLAIM;
    if (!invoice && !expense) return;
    if (invoice && (candidate.direction === 'RECEIVABLE' || candidate.status === 'VOID')) return;
    if (expense && (candidate.status === 'DRAFT' || candidate.status === 'REJECTED')) return;
    const nodeId = typeof candidate.nodeId === 'string' ? candidate.nodeId : undefined;
    const currency = typeof candidate.currency === 'string' ? candidate.currency : undefined;
    const amountValue = candidate.amount;
    const amount =
      typeof amountValue === 'string' || typeof amountValue === 'number'
        ? String(amountValue)
        : undefined;
    const date = new Date(String(invoice ? candidate.issuedAt : candidate.incurredAt));
    if (!nodeId || !currency || !amount || Number.isNaN(date.valueOf())) return;
    const limits = await this.prisma.spendLimit.findMany({
      where: {
        organizationId: principal.organizationId,
        status: 'ACTIVE',
        periodStart: { lte: date },
        periodEnd: { gt: date },
        currency,
      },
      include: { node: { select: { parentId: true } }, categoryLimits: true },
    });
    if (!limits.length) return;
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
          organizationId: principal.organizationId,
          ...(expense && excludeId ? { id: { not: excludeId } } : {}),
          status: { notIn: ['DRAFT', 'REJECTED'] },
          incurredAt: { gte: start, lt: end },
        },
        select: { nodeId: true, amount: true, currency: true, category: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId: principal.organizationId,
          ...(invoice && excludeId ? { id: { not: excludeId } } : {}),
          direction: 'PAYABLE',
          status: { not: 'VOID' },
          nodeId: { not: null },
          issuedAt: { gte: start, lt: end },
        },
        select: { nodeId: true, amount: true, currency: true, category: true },
      }),
    ]);
    const result = evaluateSpend({
      nodeId,
      amount,
      currency,
      category:
        (candidate.category as CashMovementCategory | undefined) ?? CashMovementCategory.OTHER,
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
    if (!result.allowed) {
      throw new BadRequestException(result.violations.map((item) => item.message).join(' '));
    }
  }

  async propose(
    principal: RequestPrincipal,
    input: unknown,
    options: { writeMode: boolean; threadId?: string },
  ) {
    this.requireManage(principal);
    if (!options.writeMode) {
      throw new ForbiddenException('Enable write mode in Finora before requesting a change.');
    }
    const mutation = parseRecordMutation(input);
    await this.validateReferences(principal, mutation.entityType, mutation.changes);
    const record = await this.findRecord(principal, mutation.entityType, mutation.recordId);
    if (!record)
      throw new NotFoundException('That finance record was not found in this workspace.');
    const before = plain(record);
    const normalizedChanges = plain(mutation.changes);
    const after = { ...before, ...normalizedChanges };
    await this.enforceSpendPolicy(principal, mutation.entityType, after, String(record.id));
    const diff = Object.entries(normalizedChanges)
      .filter(([field, value]) => JSON.stringify(before[field]) !== JSON.stringify(value))
      .map(([field, value]) => ({ field, before: before[field] ?? null, after: value ?? null }));
    if (!diff.length)
      throw new BadRequestException('The proposed values already match the record.');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const proposal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mutationProposal.create({
        data: {
          organizationId: principal.organizationId,
          requestedById: principal.userId,
          threadId: options.threadId,
          operation: 'UPDATE',
          entityType: mutation.entityType,
          entityId: String(record.id),
          recordExternalId: String(record.externalId),
          reason: mutation.reason,
          before,
          after,
          diff,
          expectedVersion: Number(record.version),
          expiresAt,
        },
      });
      await this.audit.record(
        principal,
        {
          action: 'FINANCE_RECORD_CHANGE_PROPOSED',
          entityType: 'MutationProposal',
          entityId: created.id,
          source: 'FINORA_CHAT',
          details: {
            recordType: mutation.entityType,
            recordExternalId: record.externalId,
            diff,
            reason: mutation.reason,
          },
        },
        tx,
      );
      return created;
    });
    return outputProposal({ ...proposal, entityType: proposal.entityType as FinancialRecordType });
  }

  async approve(principal: RequestPrincipal, proposalId: string) {
    if (!hasWorkspacePermission(principal, WorkspacePermission.APPROVE_FINANCE_ACTION)) {
      throw new ForbiddenException('Your workspace role cannot approve finance changes.');
    }
    const proposal = await this.prisma.mutationProposal.findFirst({
      where: { id: proposalId, organizationId: principal.organizationId },
    });
    if (!proposal) throw new NotFoundException('Change proposal not found.');
    if (proposal.status !== MutationStatus.PENDING_APPROVAL) {
      throw new ConflictException(`This proposal is already ${proposal.status.toLowerCase()}.`);
    }
    if (proposal.expiresAt <= new Date()) {
      await this.prisma.mutationProposal.update({
        where: { id: proposal.id },
        data: { status: MutationStatus.EXPIRED, decidedAt: new Date() },
      });
      throw new ConflictException('This proposal expired. Ask Finora to prepare a new diff.');
    }
    const diff = proposal.diff as Prisma.JsonArray;
    const changes = Object.fromEntries(
      diff.map((item) => {
        const entry = item as Prisma.JsonObject;
        return [String(entry.field), entry.after];
      }),
    );
    const mutation = parseRecordMutation({
      entityType: proposal.entityType,
      recordId: proposal.recordExternalId,
      operation: proposal.operation,
      changes,
      reason: proposal.reason,
    });
    await this.enforceSpendPolicy(
      principal,
      proposal.entityType as FinancialRecordType,
      proposal.after as Record<string, unknown>,
      proposal.entityId,
    );
    try {
      return await this.writer.execute({
        principal,
        proposalId: proposal.id,
        entityId: proposal.entityId,
        expectedVersion: proposal.expectedVersion,
        mutation,
        before: proposal.before as Prisma.JsonObject,
        after: proposal.after as Prisma.JsonObject,
        diff,
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message.includes('STALE_OR_OUT_OF_SCOPE')
          ? 'The record changed after this diff was prepared. No write was performed.'
          : 'The governed write transaction failed. No partial write was committed.';
      await this.prisma.$transaction(async (tx) => {
        await tx.mutationProposal.update({
          where: { id: proposal.id },
          data: { status: MutationStatus.FAILED, failureReason: reason, decidedAt: new Date() },
        });
        await this.audit.record(
          principal,
          {
            action: 'FINANCE_RECORD_CHANGE_FAILED',
            entityType: 'MutationProposal',
            entityId: proposal.id,
            source: 'CHAT_WRITE_EXECUTOR',
            details: { reason },
          },
          tx,
        );
      });
      throw new ConflictException(reason);
    }
  }

  async reject(principal: RequestPrincipal, proposalId: string, reason: string) {
    if (!hasWorkspacePermission(principal, WorkspacePermission.APPROVE_FINANCE_ACTION)) {
      throw new ForbiddenException('Your workspace role cannot reject finance changes.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.mutationProposal.updateMany({
        where: {
          id: proposalId,
          organizationId: principal.organizationId,
          status: MutationStatus.PENDING_APPROVAL,
        },
        data: {
          status: MutationStatus.REJECTED,
          approvedById: principal.userId,
          decidedAt: new Date(),
          failureReason: reason,
        },
      });
      if (!updated.count) throw new ConflictException('This proposal is no longer pending.');
      await this.audit.record(
        principal,
        {
          action: 'FINANCE_RECORD_CHANGE_REJECTED',
          entityType: 'MutationProposal',
          entityId: proposalId,
          source: 'FINORA_CHAT',
          details: { reason },
        },
        tx,
      );
      return { id: proposalId, status: MutationStatus.REJECTED };
    });
  }

  list(principal: RequestPrincipal) {
    this.requireManage(principal);
    return this.prisma.mutationProposal.findMany({
      where: { organizationId: principal.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createRecord(principal: RequestPrincipal, raw: unknown) {
    this.requireManage(principal);
    const input = CreateFinancialRecordSchema.parse(raw);
    await this.validateReferences(principal, input.entityType, input.data);
    await this.enforceSpendPolicy(principal, input.entityType, plain(input.data));
    const id = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      let record: Record<string, unknown>;
      const common = { id, organizationId: principal.organizationId };
      switch (input.entityType) {
        case FinancialRecordType.TRANSACTION:
          record = plain(
            await tx.transaction.create({
              data: {
                ...common,
                ...input.data,
                sourceMetadata: { source: 'MANUAL', createdBy: principal.userId },
              },
            }),
          );
          break;
        case FinancialRecordType.SETTLEMENT:
          record = plain(await tx.settlement.create({ data: { ...common, ...input.data } }));
          break;
        case FinancialRecordType.INVOICE:
          record = plain(
            await tx.invoice.create({
              data: {
                ...common,
                ...input.data,
                sourceMetadata: { source: 'MANUAL', createdBy: principal.userId },
              },
            }),
          );
          break;
        case FinancialRecordType.TAX_LINE:
          record = plain(
            await tx.taxLine.create({
              data: {
                ...common,
                ...input.data,
                sourceMetadata: { source: 'MANUAL', createdBy: principal.userId },
              },
            }),
          );
          break;
        case FinancialRecordType.CASH_MOVEMENT:
          record = plain(
            await tx.cashMovement.create({
              data: {
                ...common,
                ...input.data,
                sourceType: 'MANUAL',
                sourceMetadata: { createdBy: principal.userId },
              },
            }),
          );
          break;
        case FinancialRecordType.EXPENSE_CLAIM:
          record = plain(
            await tx.expenseClaim.create({
              data: {
                ...common,
                ...input.data,
                sourceType: 'WEB',
                categorySource: 'USER',
                categoryStatus: 'CONFIRMED',
              },
            }),
          );
          break;
      }
      await this.audit.record(
        principal,
        {
          action: 'FINANCE_RECORD_CREATED',
          entityType: input.entityType,
          entityId: id,
          source: 'RECORDS_UI',
          details: {
            after: record,
            recordExternalId: input.data.externalId,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
      return record;
    });
  }

  async updateRecord(
    principal: RequestPrincipal,
    raw: unknown,
    options: { expectedVersion: number },
  ) {
    this.requireManage(principal);
    const mutation = parseRecordMutation(raw);
    await this.validateReferences(principal, mutation.entityType, mutation.changes);
    const current = await this.findRecord(principal, mutation.entityType, mutation.recordId);
    if (!current) throw new NotFoundException('Finance record not found.');
    if (Number(current.version) !== options.expectedVersion) {
      throw new ConflictException(
        'This record changed while you were editing it. Refresh and retry.',
      );
    }
    await this.enforceSpendPolicy(
      principal,
      mutation.entityType,
      { ...plain(current), ...plain(mutation.changes) },
      String(current.id),
    );
    return this.prisma.$transaction(async (tx) => {
      const where = {
        id: String(current.id),
        organizationId: principal.organizationId,
        version: options.expectedVersion,
      };
      const data = { ...mutation.changes, version: { increment: 1 } };
      let result: Record<string, unknown>;
      switch (mutation.entityType) {
        case FinancialRecordType.TRANSACTION:
          if (
            !(
              await tx.transaction.updateMany({
                where,
                data: data as unknown as Prisma.TransactionUpdateManyMutationInput,
              })
            ).count
          )
            throw new ConflictException('This record changed while you were editing it.');
          result = plain(await tx.transaction.findUniqueOrThrow({ where: { id: where.id } }));
          break;
        case FinancialRecordType.SETTLEMENT:
          if (
            !(
              await tx.settlement.updateMany({
                where,
                data: data as unknown as Prisma.SettlementUpdateManyMutationInput,
              })
            ).count
          )
            throw new ConflictException('This record changed while you were editing it.');
          result = plain(await tx.settlement.findUniqueOrThrow({ where: { id: where.id } }));
          break;
        case FinancialRecordType.INVOICE:
          if (
            !(
              await tx.invoice.updateMany({
                where,
                data: data as unknown as Prisma.InvoiceUpdateManyMutationInput,
              })
            ).count
          )
            throw new ConflictException('This record changed while you were editing it.');
          result = plain(await tx.invoice.findUniqueOrThrow({ where: { id: where.id } }));
          break;
        case FinancialRecordType.TAX_LINE:
          if (
            !(
              await tx.taxLine.updateMany({
                where,
                data: data as unknown as Prisma.TaxLineUpdateManyMutationInput,
              })
            ).count
          )
            throw new ConflictException('This record changed while you were editing it.');
          result = plain(await tx.taxLine.findUniqueOrThrow({ where: { id: where.id } }));
          break;
        case FinancialRecordType.CASH_MOVEMENT:
          if (
            !(
              await tx.cashMovement.updateMany({
                where,
                data: data as unknown as Prisma.CashMovementUpdateManyMutationInput,
              })
            ).count
          )
            throw new ConflictException('This record changed while you were editing it.');
          result = plain(await tx.cashMovement.findUniqueOrThrow({ where: { id: where.id } }));
          break;
        case FinancialRecordType.EXPENSE_CLAIM:
          if (
            !(
              await tx.expenseClaim.updateMany({
                where,
                data: data as unknown as Prisma.ExpenseClaimUpdateManyMutationInput,
              })
            ).count
          )
            throw new ConflictException('This record changed while you were editing it.');
          result = plain(await tx.expenseClaim.findUniqueOrThrow({ where: { id: where.id } }));
          break;
      }
      await this.audit.record(
        principal,
        {
          action: 'FINANCE_RECORD_UPDATED',
          entityType: mutation.entityType,
          entityId: String(current.id),
          source: 'RECORDS_UI',
          details: {
            before: plain(current),
            after: result,
            reason: mutation.reason,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
      return result;
    });
  }
}
