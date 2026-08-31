import { Injectable } from '@nestjs/common';
import { money, type RequestPrincipal } from '@finora/platform';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}
  async overview(principal: RequestPrincipal) {
    const org = principal.organizationId;
    const [transactions, settlements, exceptions, latestRun, agentResolved, accounts, movements] =
      await Promise.all([
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
        this.prisma.cashAccount.findMany({ where: { organizationId: org } }),
        this.prisma.cashMovement.findMany({
          where: { organizationId: org, status: 'POSTED' },
          select: { direction: true, amount: true },
        }),
      ]);
    const opening = accounts.reduce(
      (total, account) => total.plus(account.openingBalance.toString()),
      money('0'),
    );
    const cash = movements.reduce(
      (total, movement) =>
        movement.direction === 'INFLOW'
          ? total.plus(movement.amount.toString())
          : total.minus(movement.amount.toString()),
      opening,
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
  transactions(principal: RequestPrincipal, query?: string) {
    return this.prisma.transaction.findMany({
      where: {
        organizationId: principal.organizationId,
        ...(query ? { externalId: { contains: query, mode: 'insensitive' } } : {}),
      },
      include: {
        settlement: {
          select: {
            externalId: true,
            expectedAmount: true,
            receivedAmount: true,
            feeAmount: true,
            gstAmount: true,
            refundAmount: true,
            settledAt: true,
          },
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }
  settlements(principal: RequestPrincipal) {
    return this.prisma.settlement.findMany({
      where: { organizationId: principal.organizationId },
      orderBy: { settledAt: 'desc' },
    });
  }
  invoices(principal: RequestPrincipal) {
    return this.prisma.invoice.findMany({
      where: { organizationId: principal.organizationId },
      include: { node: { select: { name: true, code: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  }
  cashMovements(principal: RequestPrincipal) {
    return this.prisma.cashMovement.findMany({
      where: { organizationId: principal.organizationId },
      include: { account: { select: { name: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }
  taxLines(principal: RequestPrincipal) {
    return this.prisma.taxLine.findMany({
      where: { organizationId: principal.organizationId },
      orderBy: { externalId: 'asc' },
    });
  }
  expenseClaims(principal: RequestPrincipal) {
    return this.prisma.expenseClaim.findMany({
      where: { organizationId: principal.organizationId },
      include: {
        claimant: { select: { id: true, name: true, email: true } },
        node: { select: { id: true, name: true, code: true } },
      },
      orderBy: { incurredAt: 'desc' },
      take: 200,
    });
  }
  async recordOptions(principal: RequestPrincipal) {
    const [users, nodes, accounts, settlements] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId: principal.organizationId },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.organizationNode.findMany({
        where: { organizationId: principal.organizationId, active: true },
        select: { id: true, name: true, code: true, type: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.cashAccount.findMany({
        where: { organizationId: principal.organizationId },
        select: { id: true, name: true, currency: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.settlement.findMany({
        where: { organizationId: principal.organizationId },
        select: { id: true, externalId: true },
        orderBy: { settledAt: 'desc' },
        take: 100,
      }),
    ]);
    return { users, nodes, accounts, settlements };
  }
  async forecast(principal: RequestPrincipal) {
    const [accounts, posted, scheduled] = await Promise.all([
      this.prisma.cashAccount.findMany({ where: { organizationId: principal.organizationId } }),
      this.prisma.cashMovement.findMany({
        where: { organizationId: principal.organizationId, status: 'POSTED' },
      }),
      this.prisma.cashMovement.findMany({
        where: { organizationId: principal.organizationId, status: 'SCHEDULED' },
        orderBy: { occurredAt: 'asc' },
      }),
    ]);
    let balance = accounts.reduce(
      (total, account) => total.plus(account.openingBalance.toString()),
      money('0'),
    );
    for (const movement of posted) {
      balance =
        movement.direction === 'INFLOW'
          ? balance.plus(movement.amount.toString())
          : balance.minus(movement.amount.toString());
    }
    const rows = [
      {
        day: 'Today',
        date: new Date(),
        amount: balance.toFixed(2),
        risk: balance.isNegative(),
      },
    ];
    for (const movement of scheduled) {
      balance =
        movement.direction === 'INFLOW'
          ? balance.plus(movement.amount.toString())
          : balance.minus(movement.amount.toString());
      rows.push({
        day: movement.occurredAt.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        }),
        date: movement.occurredAt,
        amount: balance.toFixed(2),
        risk: balance.isNegative(),
      });
    }
    return rows;
  }
}
