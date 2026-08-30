import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import type { RequestPrincipal } from '@finora/platform';
import type { ParsedRecordMutation } from './record-mutation.schemas.js';

const writerUrl = () => {
  if (process.env.AGENT_WRITE_DATABASE_URL) return process.env.AGENT_WRITE_DATABASE_URL;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for governed agent writes.');
  const url = new URL(databaseUrl);
  url.username = 'finora_agent_rw';
  url.password = process.env.AGENT_WRITE_DATABASE_PASSWORD ?? 'finora_agent_writer_dev';
  return url.toString();
};

@Injectable()
export class AgentWriteService implements OnModuleDestroy {
  private client?: PrismaClient;

  private database() {
    this.client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: writerUrl() }) });
    return this.client;
  }

  async execute(input: {
    principal: RequestPrincipal;
    proposalId: string;
    entityId: string;
    expectedVersion: number;
    mutation: ParsedRecordMutation;
    before: Prisma.JsonObject;
    after: Prisma.JsonObject;
    diff: Prisma.JsonArray;
  }) {
    return this.database().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.organization_id', ${input.principal.organizationId}, true)`;
      const now = new Date();
      const claimed = await tx.mutationProposal.updateMany({
        where: {
          id: input.proposalId,
          organizationId: input.principal.organizationId,
          status: 'PENDING_APPROVAL',
        },
        data: {
          status: 'EXECUTED',
          approvedById: input.principal.userId,
          decidedAt: now,
          executedAt: now,
        },
      });
      if (claimed.count !== 1) throw new Error('PROPOSAL_NOT_PENDING');
      const where = {
        id: input.entityId,
        organizationId: input.principal.organizationId,
        version: input.expectedVersion,
      };
      const data = { ...input.mutation.changes, version: { increment: 1 } };
      let count = 0;
      switch (input.mutation.entityType) {
        case 'TRANSACTION':
          count = (
            await tx.transaction.updateMany({
              where,
              data: data as unknown as Prisma.TransactionUpdateManyMutationInput,
            })
          ).count;
          break;
        case 'SETTLEMENT':
          count = (
            await tx.settlement.updateMany({
              where,
              data: data as unknown as Prisma.SettlementUpdateManyMutationInput,
            })
          ).count;
          break;
        case 'INVOICE':
          count = (
            await tx.invoice.updateMany({
              where,
              data: data as unknown as Prisma.InvoiceUpdateManyMutationInput,
            })
          ).count;
          break;
        case 'TAX_LINE':
          count = (
            await tx.taxLine.updateMany({
              where,
              data: data as unknown as Prisma.TaxLineUpdateManyMutationInput,
            })
          ).count;
          break;
        case 'CASH_MOVEMENT':
          count = (
            await tx.cashMovement.updateMany({
              where,
              data: data as unknown as Prisma.CashMovementUpdateManyMutationInput,
            })
          ).count;
          break;
        case 'EXPENSE_CLAIM':
          count = (
            await tx.expenseClaim.updateMany({
              where,
              data: data as unknown as Prisma.ExpenseClaimUpdateManyMutationInput,
            })
          ).count;
          break;
      }
      if (count !== 1) throw new Error('STALE_OR_OUT_OF_SCOPE');
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          organizationId: input.principal.organizationId,
          actor: input.principal.userId,
          actorType: 'USER',
          source: 'CHAT_WRITE_EXECUTOR',
          action: 'FINANCE_RECORD_UPDATED',
          entityType: input.mutation.entityType,
          entityId: input.entityId,
          details: {
            proposalId: input.proposalId,
            recordExternalId: input.mutation.recordId,
            reason: input.mutation.reason,
            before: input.before,
            after: input.after,
            diff: input.diff,
          },
        },
      });
      return { status: 'EXECUTED' as const, executedAt: now };
    });
  }

  async onModuleDestroy() {
    await this.client?.$disconnect();
  }
}
