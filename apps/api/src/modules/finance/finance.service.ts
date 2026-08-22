import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

const organizationId = () => process.env.DEMO_ORGANIZATION_ID ?? 'demo-org';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}
  async overview() {
    const org = organizationId();
    const [transactions, settlements, exceptions, latestRun, agentResolved] = await Promise.all([
      this.prisma.transaction.count({ where: { organizationId: org } }),
      this.prisma.settlement.findMany({
        where: { organizationId: org },
        orderBy: { settledAt: 'desc' },
        take: 8,
      }),
      this.prisma.exception.count({
        where: { organizationId: org, status: { in: ['OPEN', 'NEEDS_REVIEW', 'UNRESOLVED'] } },
      }),
      this.prisma.reconciliationRun.findFirst({
        where: { organizationId: org },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.exception.count({ where: { organizationId: org, status: 'RESOLVED' } }),
    ]);
    const cash = settlements.reduce(
      (total, settlement) => total + Number(settlement.receivedAmount),
      0,
    );
    return {
      cashPosition: cash.toFixed(2),
      recordsProcessed: transactions,
      openExceptions: exceptions,
      agentResolved,
      latestRun,
      recentSettlements: settlements,
    };
  }
  transactions(query?: string) {
    return this.prisma.transaction.findMany({
      where: {
        organizationId: organizationId(),
        ...(query ? { externalId: { contains: query, mode: 'insensitive' } } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }
  settlements() {
    return this.prisma.settlement.findMany({
      where: { organizationId: organizationId() },
      orderBy: { settledAt: 'desc' },
    });
  }
  taxLines() {
    return this.prisma.taxLine.findMany({
      where: { organizationId: organizationId() },
      orderBy: { externalId: 'asc' },
    });
  }
  async forecast() {
    const settlements = await this.prisma.settlement.findMany({
      where: { organizationId: organizationId() },
    });
    const current = settlements.reduce((sum, item) => sum + Number(item.receivedAmount), 0);
    return [
      { day: 'Today', amount: current.toFixed(2), risk: false },
      { day: 'Aug 27', amount: (current - 140000).toFixed(2), risk: false },
      { day: 'Aug 29', amount: (current - 1250000).toFixed(2), risk: true },
      { day: 'Sep 02', amount: (current - 490000).toFixed(2), risk: false },
    ];
  }
}
