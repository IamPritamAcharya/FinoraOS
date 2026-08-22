import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const orgId = 'demo-org';
const iso = (day: number) => new Date(Date.UTC(2026, 7, day, 10, 0, 0));

async function main() {
  await prisma.organization.upsert({
    where: { id: orgId },
    update: {},
    create: { id: orgId, name: 'Acme Commerce India' },
  });
  await prisma.user.upsert({
    where: { email: 'finance@finora.local' },
    update: {},
    create: {
      id: 'demo-user',
      organizationId: orgId,
      name: 'Aarav Mehta',
      email: 'finance@finora.local',
    },
  });
  await prisma.agentStep.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.exceptionEvidence.deleteMany();
  await prisma.exception.deleteMany();
  await prisma.reconciliationMatch.deleteMany();
  await prisma.reconciliationRun.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.taxLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.settlement.deleteMany();
  const settlements = Array.from({ length: 12 }, (_, index) => {
    const expected = 142000 + index * 17350;
    const fees = 2450 + index * 110;
    const gst = Math.round(fees * 0.18 * 100) / 100;
    const refunds = index % 4 === 0 ? 3200 : 0;
    const unexplained = index === 10 ? 850 : 0;
    return {
      id: `settlement-${index + 1}`,
      organizationId: orgId,
      externalId: `STL_${String(index + 1).padStart(4, '0')}`,
      expectedAmount: expected.toFixed(2),
      receivedAmount: (expected - fees - gst - refunds - unexplained).toFixed(2),
      feeAmount: fees.toFixed(2),
      gstAmount: gst.toFixed(2),
      refundAmount: refunds.toFixed(2),
      settledAt: iso(index + 1),
    };
  });
  await prisma.settlement.createMany({ data: settlements });
  const transactions = Array.from({ length: 120 }, (_, index) => ({
    id: `txn-${index + 1}`,
    organizationId: orgId,
    externalId: `pay_${String(index + 1).padStart(5, '0')}`,
    amount: (8500 + ((index * 791) % 17800)).toFixed(2),
    currency: 'INR',
    status: index % 29 === 0 ? ('REFUNDED' as const) : ('CAPTURED' as const),
    occurredAt: iso((index % 12) + 1),
    settlementId: settlements[index % 12].id,
    sourceMetadata: { source: 'mock-razorpay', reference: `bank_ref_${index + 1}` },
  }));
  await prisma.transaction.createMany({ data: transactions });
  await prisma.invoice.createMany({
    data: Array.from({ length: 18 }, (_, index) => ({
      organizationId: orgId,
      externalId: `INV_${String(index + 1).padStart(4, '0')}`,
      amount: (27000 + index * 4300).toFixed(2),
      currency: 'INR',
      issuedAt: iso((index % 12) + 1),
    })),
  });
  await prisma.taxLine.createMany({
    data: Array.from({ length: 18 }, (_, index) => ({
      organizationId: orgId,
      externalId: `GST_${String(index + 1).padStart(4, '0')}`,
      amount: (4860 + index * 774).toFixed(2),
      taxRate: '18.00',
      matched: index % 6 !== 0,
    })),
  });
  const run = await prisma.reconciliationRun.create({
    data: {
      organizationId: orgId,
      status: 'COMPLETED',
      completedAt: new Date(),
      recordsProcessed: 156,
      deterministicMatches: 142,
      exceptionsGenerated: 14,
      agentResolved: 8,
      needsReview: 4,
      unresolved: 2,
    },
  });
  await prisma.reconciliationMatch.createMany({
    data: transactions.slice(0, 110).map((transaction) => ({
      reconciliationRunId: run.id,
      transactionId: transaction.id,
      settlementId: transaction.settlementId,
      status: 'MATCHED',
      confidence: '1.000',
      reason: 'Exact payment reference and amount match',
    })),
  });
  const exceptionRows = Array.from({ length: 14 }, (_, index) => {
    const settlement = settlements[index % settlements.length];
    const unresolved = index >= 12;
    const review = index >= 8 && index < 12;
    const fees = settlement.feeAmount;
    const gst = settlement.gstAmount;
    const refunds = settlement.refundAmount;
    return {
      id: `exception-${index + 1}`,
      organizationId: orgId,
      reconciliationRunId: run.id,
      externalId: `EXC_${String(index + 1).padStart(3, '0')}`,
      type: index % 5 === 0 ? ('TAX_MISMATCH' as const) : ('SETTLEMENT_MISMATCH' as const),
      status: unresolved
        ? ('UNRESOLVED' as const)
        : review
          ? ('NEEDS_REVIEW' as const)
          : index < 4
            ? ('RESOLVED' as const)
            : ('OPEN' as const),
      expectedAmount: settlement.expectedAmount,
      receivedAmount: settlement.receivedAmount,
      confidence: unresolved ? '0.300' : review ? '0.620' : '0.970',
      reason: unresolved
        ? 'Missing counterparty evidence.'
        : review
          ? 'Candidate records have conflicting references.'
          : 'Settlement difference requires investigation.',
      resolution:
        index < 4 ? { approved: true, reason: 'Fee and GST adjustment approved' } : undefined,
      settlement,
      fees,
      gst,
      refunds,
    };
  });
  for (const item of exceptionRows) {
    await prisma.exception.create({
      data: {
        id: item.id,
        organizationId: item.organizationId,
        reconciliationRunId: item.reconciliationRunId,
        externalId: item.externalId,
        type: item.type,
        status: item.status,
        expectedAmount: item.expectedAmount,
        receivedAmount: item.receivedAmount,
        confidence: item.confidence,
        reason: item.reason,
        resolution: item.resolution,
        evidence: {
          create: {
            label: 'Settlement breakdown',
            referenceId: item.settlement.externalId,
            payload: {
              settlementId: item.settlement.externalId,
              expectedAmount: item.expectedAmount,
              receivedAmount: item.receivedAmount,
              gatewayFees: item.fees,
              gstOnFees: item.gst,
              refunds: item.refunds,
            },
          },
        },
      },
    });
  }
  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: orgId,
        actor: 'Reconciliation Engine',
        action: 'RECONCILIATION_COMPLETED',
        entityType: 'ReconciliationRun',
        entityId: run.id,
        details: { matched: 142, exceptions: 14 },
      },
      {
        organizationId: orgId,
        actor: 'Exception Investigator',
        action: 'RESOLUTION_PROPOSED',
        entityType: 'Exception',
        entityId: 'exception-5',
        details: { confidence: 0.97 },
      },
    ],
  });
  console.log('Seeded Acme Commerce India: 120 transactions, 12 settlements, 14 exceptions.');
}
main().finally(() => prisma.$disconnect());
