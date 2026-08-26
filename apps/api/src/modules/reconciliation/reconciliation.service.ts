import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import {
  ExceptionResolutionSchema,
  ExceptionStatus,
  money,
  type RequestPrincipal,
} from '@finora/platform';
import { apiLogger } from '../../common/api-logger.js';
import {
  runReconciliation,
  type ReconciliationException,
  type ReconciliationRecord,
} from '@finora/reconciliation';

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
  latestRun(principal: RequestPrincipal) {
    return this.prisma.reconciliationRun.findFirst({
      where: { organizationId: principal.organizationId },
      orderBy: { startedAt: 'desc' },
      include: { matches: true, exceptions: true },
    });
  }
  exceptions(principal: RequestPrincipal) {
    return this.prisma.exception.findMany({
      where: { organizationId: principal.organizationId },
      include: { evidence: true, agentRuns: { include: { steps: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  async exceptionByExternalId(principal: RequestPrincipal, externalId: string) {
    return this.prisma.exception.findFirst({
      where: { organizationId: principal.organizationId, externalId: externalId.toUpperCase() },
      include: { evidence: true, agentRuns: { include: { steps: true } } },
    });
  }
  async exceptionsForChat(principal: RequestPrincipal, minimumAmount?: string) {
    const exceptions = await this.prisma.exception.findMany({
      where: {
        organizationId: principal.organizationId,
        status: { in: ['OPEN', 'NEEDS_REVIEW', 'UNRESOLVED', 'PROPOSED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const minimum = minimumAmount ? money(minimumAmount) : null;
    return exceptions
      .map((exception) => ({
        exception,
        variance: money(exception.expectedAmount.toString()).minus(
          exception.receivedAmount.toString(),
        ),
      }))
      .filter(({ variance }) => !minimum || variance.abs().greaterThan(minimum))
      .sort((left, right) => right.variance.abs().comparedTo(left.variance.abs()))
      .slice(0, 7)
      .map(({ exception, variance }) => ({
        id: exception.id,
        externalId: exception.externalId,
        status: exception.status,
        type: exception.type,
        reason: exception.reason,
        variance: variance.toFixed(2),
      }));
  }
  async approve(principal: RequestPrincipal, id: string) {
    const exception = await this.prisma.exception.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!exception) throw new NotFoundException('Exception not found');
    if (exception.status !== ExceptionStatus.PROPOSED || !exception.resolution) {
      throw new BadRequestException('Only a validated proposed resolution can be approved.');
    }
    const parsed = ExceptionResolutionSchema.safeParse(exception.resolution);
    if (!parsed.success) throw new BadRequestException('The stored proposal failed validation.');
    const resolution = parsed.data;
    const action = resolution.proposedActions?.[0];
    if (action?.type !== 'CREATE_SETTLEMENT_FEE_ADJUSTMENT') {
      throw new BadRequestException('This proposal requires human review and cannot be executed.');
    }
    const actionType = action.type;
    const actionPayload = JSON.parse(JSON.stringify(action.payload ?? {})) as Prisma.InputJsonValue;
    const amount = money(exception.expectedAmount.toString())
      .minus(exception.receivedAmount.toString())
      .abs();
    const approved = await this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.adjustment.upsert({
        where: {
          organizationId_exceptionId_type: {
            organizationId: principal.organizationId,
            exceptionId: exception.id,
            type: actionType,
          },
        },
        update: {},
        create: {
          organizationId: principal.organizationId,
          exceptionId: exception.id,
          type: actionType,
          amount: amount.toFixed(2),
          currency: 'INR',
          details: actionPayload,
          approvedBy: principal.userId,
          approvedAt: new Date(),
          executedAt: new Date(),
        },
      });
      const updated = await tx.exception.update({
        where: { id: exception.id },
        data: {
          status: ExceptionStatus.RESOLVED,
          resolution: JSON.parse(
            JSON.stringify({ ...resolution, approved: true, adjustmentId: adjustment.id }),
          ) as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'RESOLUTION_APPROVED_AND_EXECUTED',
          entityType: 'Exception',
          entityId: exception.id,
          details: { adjustmentId: adjustment.id, actionType },
        },
      });
      return { exception: updated, adjustment };
    });
    let rerun: Awaited<ReturnType<ReconciliationService['run']>> | null = null;
    try {
      rerun = await this.run(principal);
      await this.prisma.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: 'Reconciliation Engine',
          action: 'POST_APPROVAL_RECONCILIATION_RERUN',
          entityType: 'Exception',
          entityId: exception.id,
          details: { reconciliationRunId: rerun.run.id, adjustmentId: approved.adjustment.id },
        },
      });
    } catch (error) {
      apiLogger.error('Post-approval reconciliation rerun failed', {
        exceptionId: exception.id,
        adjustmentId: approved.adjustment.id,
        error: error instanceof Error ? error.message : 'Unknown rerun error',
      });
    }
    return { ...approved, rerun };
  }

  async reject(principal: RequestPrincipal, id: string, reason: string) {
    const exception = await this.prisma.exception.findFirst({
      where: { id, organizationId: principal.organizationId },
    });
    if (!exception) throw new NotFoundException('Exception not found');
    if (exception.status !== ExceptionStatus.PROPOSED) {
      throw new BadRequestException('Only a proposed resolution can be rejected.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exception.update({
        where: { id },
        data: {
          status: ExceptionStatus.NEEDS_REVIEW,
          resolution: JSON.parse(
            JSON.stringify({
              ...(exception.resolution as object),
              rejected: true,
              rejectionReason: reason,
            }),
          ) as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actor: principal.userId,
          action: 'PROPOSED_RESOLUTION_REJECTED',
          entityType: 'Exception',
          entityId: id,
          details: { reason },
        },
      });
      return updated;
    });
  }

  async run(principal: RequestPrincipal) {
    const organizationId = principal.organizationId;
    apiLogger.info('Reconciliation run started', { organizationId });
    const transactions = await this.prisma.transaction.findMany({
      where: { organizationId },
      orderBy: { id: 'asc' },
    });
    apiLogger.info('Reconciliation source records loaded', {
      organizationId,
      transactionCount: transactions.length,
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
    apiLogger.info('Deterministic reconciliation completed', {
      organizationId,
      paymentCount: payments.length,
      bankRecordCount: bankRecords.length,
      ...result.metrics,
    });

    const persisted = await this.prisma.$transaction(async (tx) => {
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
    apiLogger.info('Reconciliation run persisted', {
      organizationId,
      reconciliationRunId: persisted.run.id,
      ...persisted.metrics,
    });
    return persisted;
  }
}
