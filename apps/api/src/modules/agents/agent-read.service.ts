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

  async findTransactions(
    organizationId: string,
    input: { minimumAmount?: string; status?: string; take?: number } = {},
  ) {
    return this.forOrganization(organizationId, (tx) =>
      tx.transaction.findMany({
        where: {
          ...(input.minimumAmount ? { amount: { gte: input.minimumAmount } } : {}),
          ...(input.status ? { status: input.status as never } : {}),
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
        take: Math.min(input.take ?? 25, 100),
      }),
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
      const aggregate = await tx.settlement.aggregate({ _sum: { receivedAmount: true } });
      const current = aggregate._sum.receivedAmount ?? new Prisma.Decimal(0);
      return [
        { day: 'Today', amount: current },
        { day: 'Aug 27', amount: current.minus('140000') },
        { day: 'Aug 29', amount: current.minus('1250000'), risk: true },
        { day: 'Sep 02', amount: current.minus('490000') },
      ];
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
