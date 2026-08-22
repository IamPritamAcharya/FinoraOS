import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ExceptionStatus } from '@finora/platform';
import {
  runReconciliation,
  type ReconciliationException,
  type ReconciliationRecord,
} from '@finora/reconciliation';
const org = () => process.env.DEMO_ORGANIZATION_ID ?? 'demo-org';

type SeedMetadata = {
  bankReference?: string;
  reconciliationScenario?:
    | 'EXACT'
    | 'DATE_WINDOW'
    | 'COMPOSITE'
    | 'AMBIGUOUS'
    | 'MISSING'
    | 'AMOUNT_MISMATCH';
  bankDescription?: string;
};

const datePlusDays = (value: Date, days: number) =>
  new Date(value.getTime() + days * 86_400_000).toISOString();

const exceptionType = (item: ReconciliationException) =>
  item.kind === 'MISSING_COUNTERPART'
    ? 'MISSING_BANK_RECORD'
    : item.kind === 'AMOUNT_MISMATCH'
      ? 'SETTLEMENT_MISMATCH'
      : 'AMBIGUOUS_MATCH';

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}
  latestRun() {
    return this.prisma.reconciliationRun.findFirst({
      where: { organizationId: org() },
      orderBy: { startedAt: 'desc' },
      include: { matches: true, exceptions: true },
    });
  }
  exceptions() {
    return this.prisma.exception.findMany({
      where: { organizationId: org() },
      include: { evidence: true, agentRuns: { include: { steps: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  async approve(id: string) {
    return this.prisma.exception.update({
      where: { id },
      data: {
        status: ExceptionStatus.RESOLVED,
        resolution: { approved: true, actor: 'demo.finance@finora.local' },
      },
    });
  }

  async run() {
    const organizationId = org();
    const transactions = await this.prisma.transaction.findMany({
      where: { organizationId },
      orderBy: { id: 'asc' },
    });
    const payments: ReconciliationRecord[] = transactions.map((transaction) => {
      const metadata = (transaction.sourceMetadata ?? {}) as SeedMetadata;
      return {
        id: transaction.id,
        source: 'PAYMENT',
        reference: metadata.bankReference ?? transaction.externalId,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        occurredOn: transaction.occurredAt.toISOString(),
        settlementReference: transaction.settlementId,
        description: `payment ${transaction.externalId}`,
      };
    });
    const bankRecords = transactions.flatMap((transaction): ReconciliationRecord[] => {
      const metadata = (transaction.sourceMetadata ?? {}) as SeedMetadata;
      const scenario = metadata.reconciliationScenario ?? 'EXACT';
      if (scenario === 'MISSING') return [];
      const base: ReconciliationRecord = {
        id: `bank-${transaction.id}`,
        source: 'BANK_STATEMENT',
        reference:
          scenario === 'DATE_WINDOW' || scenario === 'COMPOSITE' || scenario === 'AMBIGUOUS'
            ? undefined
            : (metadata.bankReference ?? transaction.externalId),
        amount:
          scenario === 'AMOUNT_MISMATCH'
            ? transaction.amount.plus('100').toString()
            : transaction.amount.toString(),
        currency: transaction.currency,
        occurredOn: datePlusDays(
          transaction.occurredAt,
          scenario === 'DATE_WINDOW' ? 1 : scenario === 'COMPOSITE' ? 3 : 0,
        ),
        settlementReference: undefined,
        description: metadata.bankDescription ?? `payment ${transaction.externalId}`,
      };
      return scenario === 'AMBIGUOUS' ? [base, { ...base, id: `${base.id}-duplicate` }] : [base];
    });
    const result = runReconciliation(payments, bankRecords);

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.reconciliationRun.create({
        data: {
          organizationId,
          status: 'COMPLETED',
          completedAt: new Date(),
          recordsProcessed: result.metrics.recordsProcessed,
          deterministicMatches: result.metrics.matched,
          exceptionsGenerated: result.metrics.exceptions,
          agentResolved: 0,
          needsReview: result.metrics.ambiguousExceptions + result.metrics.lowConfidenceExceptions,
          unresolved:
            result.metrics.missingCounterpartExceptions + result.metrics.amountMismatchExceptions,
        },
      });
      await tx.reconciliationMatch.createMany({
        data: result.matches.map((item) => ({
          reconciliationRunId: run.id,
          transactionId: item.leftRecordId,
          status: 'MATCHED',
          confidence: item.confidence.toFixed(3),
          reason: item.reason,
        })),
      });
      for (const [index, item] of result.exceptions.entries()) {
        const externalId = `EXC_${run.id.slice(-6).toUpperCase()}_${String(index + 1).padStart(3, '0')}`;
        await tx.exception.create({
          data: {
            id: `exception-${run.id}-${index + 1}`,
            organizationId,
            reconciliationRunId: run.id,
            externalId,
            type: exceptionType(item),
            status:
              item.kind === 'AMBIGUOUS_MATCH' || item.kind === 'LOW_CONFIDENCE'
                ? 'NEEDS_REVIEW'
                : 'OPEN',
            expectedAmount: item.expectedAmount,
            receivedAmount: item.receivedAmount,
            confidence: item.confidence.toFixed(3),
            reason: item.reason,
            evidence: {
              create: {
                label: 'Deterministic reconciliation evidence',
                referenceId: item.leftRecordId,
                payload: item.evidence,
              },
            },
          },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          actor: 'Reconciliation Engine',
          action: 'RECONCILIATION_COMPLETED',
          entityType: 'ReconciliationRun',
          entityId: run.id,
          details: result.metrics,
        },
      });
      return {
        run,
        metrics: result.metrics,
        matches: result.matches,
        exceptions: result.exceptions,
      };
    });
  }
}
