import { describe, expect, it, vi } from 'vitest';
import { ReconciliationService } from './reconciliation.service.js';

const transaction = (id: string, scenario = 'EXACT') => ({
  id,
  organizationId: 'demo-org',
  externalId: `pay_${id}`,
  amount: { toString: () => '100.00', plus: () => ({ toString: () => '200.00' }) },
  currency: 'INR',
  occurredAt: new Date('2026-08-10T00:00:00.000Z'),
  settlementId: null,
  sourceMetadata: {
    bankReference: `bank_${id}`,
    reconciliationScenario: scenario,
    bankDescription: `payment ${id}`,
  },
});

const prismaMock = (items = [transaction('1'), transaction('2', 'MISSING')]) => {
  const tx = {
    reconciliationRun: { create: vi.fn().mockResolvedValue({ id: 'run-1' }) },
    reconciliationMatch: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    exception: { create: vi.fn().mockResolvedValue({ id: 'exception-1' }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  return {
    transaction: { findMany: vi.fn().mockResolvedValue(items) },
    $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    tx,
  };
};

describe('ReconciliationService.run', () => {
  it('runs the shared engine and persists scoped run, matches, exceptions and audit data', async () => {
    const prisma = prismaMock();
    const service = new ReconciliationService(prisma as never);

    const result = await service.run();

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'demo-org' } }),
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.tx.reconciliationRun.create).toHaveBeenCalledOnce();
    expect(prisma.tx.reconciliationMatch.createMany).toHaveBeenCalledOnce();
    expect(prisma.tx.exception.create).toHaveBeenCalledOnce();
    expect(prisma.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'RECONCILIATION_COMPLETED' }),
      }),
    );
    expect(result.metrics).toMatchObject({ matched: 1, exceptions: 1 });
  });

  it('fails safely when persistence inside the transaction fails', async () => {
    const prisma = prismaMock();
    prisma.tx.exception.create.mockRejectedValueOnce(new Error('database write failed'));
    const service = new ReconciliationService(prisma as never);

    await expect(service.run()).rejects.toThrow('database write failed');
    expect(prisma.tx.auditLog.create).not.toHaveBeenCalled();
  });
});
