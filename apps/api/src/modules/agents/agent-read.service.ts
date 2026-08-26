import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

const agentDatabaseUrl = () => {
  if (process.env.AGENT_READ_DATABASE_URL) return process.env.AGENT_READ_DATABASE_URL;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('AGENT_READ_DATABASE_URL is required for agent reads.');
  const url = new URL(databaseUrl);
  url.username = 'finora_agent_ro';
  url.password = process.env.AGENT_READ_DATABASE_PASSWORD ?? 'finora_agent_readonly_dev';
  return url.toString();
};

type ReadClient = Prisma.TransactionClient;

/** Read-only, tenant-scoped data access for controlled agent tools. */
@Injectable()
export class AgentReadService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: agentDatabaseUrl() }) });
  }

  onModuleInit() {
    return this.$connect();
  }

  onModuleDestroy() {
    return this.$disconnect();
  }

  async forOrganization<T>(organizationId: string, query: (tx: ReadClient) => Promise<T>) {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      return query(tx);
    });
  }

  async organizationSummary(organizationId: string) {
    return this.forOrganization(organizationId, async (tx) => {
      const [users, transactions, settlements, invoices, taxLines, exceptions, reconciliationRuns] =
        await Promise.all([
          tx.user.count(),
          tx.transaction.count(),
          tx.settlement.count(),
          tx.invoice.count(),
          tx.taxLine.count(),
          tx.exception.count(),
          tx.reconciliationRun.count(),
        ]);
      return {
        users,
        transactions,
        settlements,
        invoices,
        taxLines,
        exceptions,
        reconciliationRuns,
      };
    });
  }

  async listUsers(organizationId: string, take = 25) {
    return this.forOrganization(organizationId, (tx) =>
      tx.user.findMany({
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
        take,
      }),
    );
  }

  async getCurrentUser(organizationId: string, userId: string) {
    return this.forOrganization(organizationId, (tx) =>
      tx.user.findFirst({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      }),
    );
  }

  async paymentSummary(
    organizationId: string,
    input: { from?: string; to?: string; status?: string },
  ) {
    return this.forOrganization(organizationId, async (tx) => {
      const where = {
        ...(input.status ? { status: input.status as never } : {}),
        ...(input.from || input.to
          ? {
              occurredAt: {
                ...(input.from ? { gte: new Date(input.from) } : {}),
                ...(input.to ? { lte: new Date(input.to) } : {}),
              },
            }
          : {}),
      };
      const aggregate = await tx.transaction.aggregate({
        where,
        _count: true,
        _sum: { amount: true },
        _avg: { amount: true },
        _max: { amount: true },
      });
      return {
        from: input.from,
        to: input.to,
        status: input.status,
        currency: 'INR',
        count: aggregate._count,
        total: aggregate._sum.amount ?? new Prisma.Decimal(0),
        average: aggregate._avg.amount ?? new Prisma.Decimal(0),
        largest: aggregate._max.amount ?? new Prisma.Decimal(0),
      };
    });
  }

  async settlementSummary(organizationId: string, input: { from?: string; to?: string }) {
    return this.forOrganization(organizationId, async (tx) => {
      const rows = await tx.settlement.findMany({
        where:
          input.from || input.to
            ? {
                settledAt: {
                  ...(input.from ? { gte: new Date(input.from) } : {}),
                  ...(input.to ? { lte: new Date(input.to) } : {}),
                },
              }
            : {},
        select: {
          expectedAmount: true,
          receivedAmount: true,
          feeAmount: true,
          gstAmount: true,
          refundAmount: true,
        },
      });
      const zero = () => new Prisma.Decimal(0);
      const totals = rows.reduce(
        (sum, row) => ({
          expected: sum.expected.plus(row.expectedAmount),
          received: sum.received.plus(row.receivedAmount),
          fees: sum.fees.plus(row.feeAmount),
          gst: sum.gst.plus(row.gstAmount),
          refunds: sum.refunds.plus(row.refundAmount),
        }),
        { expected: zero(), received: zero(), fees: zero(), gst: zero(), refunds: zero() },
      );
      return {
        ...totals,
        unexplained: totals.expected
          .minus(totals.received)
          .minus(totals.fees)
          .minus(totals.gst)
          .minus(totals.refunds),
        count: rows.length,
        currency: 'INR',
        ...input,
      };
    });
  }

  async invoiceSummary(organizationId: string, input: { from?: string; to?: string }) {
    return this.forOrganization(organizationId, async (tx) => {
      const result = await tx.invoice.aggregate({
        where:
          input.from || input.to
            ? {
                issuedAt: {
                  ...(input.from ? { gte: new Date(input.from) } : {}),
                  ...(input.to ? { lte: new Date(input.to) } : {}),
                },
              }
            : {},
        _count: true,
        _sum: { amount: true },
        _avg: { amount: true },
      });
      return {
        count: result._count,
        total: result._sum.amount ?? new Prisma.Decimal(0),
        average: result._avg.amount ?? new Prisma.Decimal(0),
        currency: 'INR',
        ...input,
      };
    });
  }

  async taxSummary(organizationId: string, input: { matched?: boolean }) {
    return this.forOrganization(organizationId, async (tx) => {
      const rows = await tx.taxLine.findMany({
        where: input.matched === undefined ? {} : { matched: input.matched },
        select: { amount: true, matched: true },
      });
      return {
        count: rows.length,
        matched: rows.filter((row) => row.matched).length,
        unmatched: rows.filter((row) => !row.matched).length,
        total: rows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)),
        currency: 'INR',
      };
    });
  }

  async expenseSummary(
    organizationId: string,
    input: { from: string; to: string; category?: string },
  ) {
    return this.forOrganization(organizationId, async (tx) => {
      const rows = await tx.cashMovement.findMany({
        where: {
          direction: 'OUTFLOW',
          status: 'POSTED',
          occurredAt: { gte: new Date(input.from), lte: new Date(input.to) },
          ...(input.category ? { category: input.category as never } : {}),
        },
        select: {
          externalId: true,
          category: true,
          amount: true,
          currency: true,
          description: true,
          counterparty: true,
          occurredAt: true,
        },
        orderBy: [{ amount: 'desc' }, { occurredAt: 'desc' }],
        take: 100,
      });
      const byCategory = new Map<string, Prisma.Decimal>();
      let total = new Prisma.Decimal(0);
      for (const row of rows) {
        total = total.plus(row.amount);
        byCategory.set(
          row.category,
          (byCategory.get(row.category) ?? new Prisma.Decimal(0)).plus(row.amount),
        );
      }
      return {
        from: input.from,
        to: input.to,
        currency: rows[0]?.currency ?? 'INR',
        total,
        count: rows.length,
        categories: [...byCategory.entries()]
          .map(([category, amount]) => ({ category, amount }))
          .sort((left, right) => right.amount.comparedTo(left.amount)),
        largest: rows.slice(0, 5),
      };
    });
  }

  async findCashMovements(
    organizationId: string,
    input: {
      direction?: 'INFLOW' | 'OUTFLOW';
      category?: string;
      status?: 'POSTED' | 'SCHEDULED';
      from?: string;
      to?: string;
      minimumAmount?: string;
      take?: number;
    },
  ) {
    return this.forOrganization(organizationId, (tx) =>
      tx.cashMovement.findMany({
        where: {
          ...(input.direction ? { direction: input.direction } : {}),
          ...(input.category ? { category: input.category as never } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.from || input.to
            ? {
                occurredAt: {
                  ...(input.from ? { gte: new Date(input.from) } : {}),
                  ...(input.to ? { lte: new Date(input.to) } : {}),
                },
              }
            : {}),
          ...(input.minimumAmount ? { amount: { gte: input.minimumAmount } } : {}),
        },
        select: {
          externalId: true,
          direction: true,
          category: true,
          status: true,
          amount: true,
          currency: true,
          description: true,
          counterparty: true,
          occurredAt: true,
          sourceType: true,
          sourceId: true,
        },
        orderBy: { occurredAt: 'desc' },
        take: Math.min(input.take ?? 12, 100),
      }),
    );
  }

  async findTransactions(
    organizationId: string,
    input: {
      minimumAmount?: string;
      status?: string;
      from?: string;
      to?: string;
      take?: number;
    } = {},
  ) {
    return this.forOrganization(organizationId, (tx) =>
      tx.transaction.findMany({
        where: {
          ...(input.minimumAmount ? { amount: { gte: input.minimumAmount } } : {}),
          ...(input.status ? { status: input.status as never } : {}),
          ...(input.from || input.to
            ? {
                occurredAt: {
                  ...(input.from ? { gte: new Date(input.from) } : {}),
                  ...(input.to ? { lte: new Date(input.to) } : {}),
                },
              }
            : {}),
        },
        select: {
          externalId: true,
          amount: true,
          currency: true,
          status: true,
          occurredAt: true,
          settlementId: true,
        },
        orderBy: { occurredAt: 'desc' },
        take: Math.min(input.take ?? 12, 100),
      }),
    );
  }

  async findSettlements(
    organizationId: string,
    input: { from?: string; to?: string; minimumVariance?: string; take?: number },
  ) {
    const rows = await this.forOrganization(organizationId, (tx) =>
      tx.settlement.findMany({
        where:
          input.from || input.to
            ? {
                settledAt: {
                  ...(input.from ? { gte: new Date(input.from) } : {}),
                  ...(input.to ? { lte: new Date(input.to) } : {}),
                },
              }
            : {},
        select: {
          externalId: true,
          expectedAmount: true,
          receivedAmount: true,
          feeAmount: true,
          gstAmount: true,
          refundAmount: true,
          settledAt: true,
        },
        orderBy: { settledAt: 'desc' },
        take: Math.min(input.take ?? 25, 100),
      }),
    );
    return rows.filter(
      (row) =>
        !input.minimumVariance ||
        row.expectedAmount
          .minus(row.receivedAmount)
          .abs()
          .greaterThanOrEqualTo(input.minimumVariance),
    );
  }

  async findInvoices(organizationId: string, take = 25) {
    return this.forOrganization(organizationId, (tx) =>
      tx.invoice.findMany({
        select: { externalId: true, amount: true, currency: true, issuedAt: true },
        orderBy: { issuedAt: 'desc' },
        take: Math.min(take, 100),
      }),
    );
  }

  async findAuditEvents(organizationId: string, take = 25) {
    return this.forOrganization(organizationId, (tx) =>
      tx.auditLog.findMany({
        select: { actor: true, action: true, entityType: true, entityId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: Math.min(take, 100),
      }),
    );
  }

  async findAgentRuns(organizationId: string, take = 25) {
    return this.forOrganization(organizationId, (tx) =>
      tx.agentRun.findMany({
        select: {
          agentType: true,
          status: true,
          exceptionId: true,
          startedAt: true,
          completedAt: true,
        },
        orderBy: { startedAt: 'desc' },
        take: Math.min(take, 100),
      }),
    );
  }

  async getSettlement(organizationId: string, externalId: string) {
    return this.forOrganization(organizationId, (tx) =>
      tx.settlement.findFirst({
        where: { externalId },
        select: {
          externalId: true,
          expectedAmount: true,
          receivedAmount: true,
          feeAmount: true,
          gstAmount: true,
          refundAmount: true,
          settledAt: true,
        },
      }),
    );
  }

  async findExceptions(organizationId: string, minimumAmount?: string) {
    return this.forOrganization(organizationId, (tx) =>
      tx.exception.findMany({
        where: { status: { in: ['OPEN', 'NEEDS_REVIEW', 'UNRESOLVED', 'PROPOSED'] } },
        select: {
          externalId: true,
          status: true,
          type: true,
          expectedAmount: true,
          receivedAmount: true,
          confidence: true,
          reason: true,
        },
        take: 100,
      }),
    ).then((rows) =>
      rows
        .filter(
          (row) =>
            !minimumAmount ||
            row.expectedAmount.minus(row.receivedAmount).abs().greaterThanOrEqualTo(minimumAmount),
        )
        .slice(0, 25),
    );
  }

  async findUnmatchedTaxLines(organizationId: string) {
    return this.forOrganization(organizationId, (tx) =>
      tx.taxLine.findMany({
        where: { matched: false },
        select: { externalId: true, amount: true, taxRate: true },
        orderBy: { externalId: 'asc' },
        take: 100,
      }),
    );
  }

  async getException(organizationId: string, externalId: string) {
    return this.forOrganization(organizationId, (tx) =>
      tx.exception.findFirst({
        where: { externalId },
        select: {
          externalId: true,
          status: true,
          expectedAmount: true,
          receivedAmount: true,
          confidence: true,
          reason: true,
          resolution: true,
        },
      }),
    );
  }

  async cashForecast(organizationId: string) {
    return this.forOrganization(organizationId, async (tx) => {
      const [accounts, posted, scheduled] = await Promise.all([
        tx.cashAccount.findMany(),
        tx.cashMovement.findMany({ where: { status: 'POSTED' } }),
        tx.cashMovement.findMany({
          where: { status: 'SCHEDULED' },
          orderBy: { occurredAt: 'asc' },
        }),
      ]);
      let balance = accounts.reduce(
        (total, account) => total.plus(account.openingBalance),
        new Prisma.Decimal(0),
      );
      for (const movement of posted) {
        balance =
          movement.direction === 'INFLOW'
            ? balance.plus(movement.amount)
            : balance.minus(movement.amount);
      }
      const result = [
        {
          day: 'Today',
          date: new Date().toISOString(),
          amount: balance,
          risk: balance.isNegative(),
        },
      ];
      for (const movement of scheduled) {
        balance =
          movement.direction === 'INFLOW'
            ? balance.plus(movement.amount)
            : balance.minus(movement.amount);
        result.push({
          day: movement.occurredAt.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          }),
          date: movement.occurredAt.toISOString(),
          amount: balance,
          risk: balance.isNegative(),
        });
      }
      return result;
    });
  }

  async findReconciliationRuns(organizationId: string, take = 25) {
    return this.forOrganization(organizationId, (tx) =>
      tx.reconciliationRun.findMany({
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          recordsProcessed: true,
          deterministicMatches: true,
          exceptionsGenerated: true,
          unresolved: true,
        },
        orderBy: { startedAt: 'desc' },
        take: Math.min(take, 100),
      }),
    );
  }

  async findExceptionEvidence(organizationId: string, exceptionId: string) {
    return this.forOrganization(organizationId, (tx) =>
      tx.exceptionEvidence.findMany({
        where: { exception: { externalId: exceptionId } },
        select: { label: true, referenceId: true, payload: true },
        take: 25,
      }),
    );
  }
}
