import { ForbiddenException } from '@nestjs/common';
import { FinancialRecordType, WorkspaceRole, type RequestPrincipal } from '@finora/platform';
import { describe, expect, it, vi } from 'vitest';
import { RecordMutationService } from './record-mutation.service.js';

const principal: RequestPrincipal = {
  organizationId: 'org-a',
  userId: 'controller-a',
  role: WorkspaceRole.FINANCE_CONTROLLER,
};

const setup = () => {
  const tx = {
    mutationProposal: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    transaction: { findFirst: vi.fn() },
    settlement: { findFirst: vi.fn() },
    invoice: { findFirst: vi.fn() },
    taxLine: { findFirst: vi.fn() },
    cashMovement: { findFirst: vi.fn() },
    expenseClaim: { findFirst: vi.fn() },
    organizationNode: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    cashAccount: { findFirst: vi.fn() },
    mutationProposal: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const writer = { execute: vi.fn() };
  const audit = { record: vi.fn() };
  const service = new RecordMutationService(prisma as never, writer as never, audit as never);
  return { service, prisma, tx, writer, audit };
};

describe('RecordMutationService', () => {
  it('refuses to prepare a proposal unless write mode is explicit', async () => {
    const { service } = setup();
    await expect(
      service.propose(
        principal,
        {
          entityType: FinancialRecordType.TRANSACTION,
          recordId: 'pay_00008',
          changes: { status: 'REFUNDED' },
          reason: 'Correct the status.',
        },
        { writeMode: false },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stores a before/after diff but never invokes the writer while proposing', async () => {
    const { service, prisma, tx, writer } = setup();
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'transaction-a',
      organizationId: 'org-a',
      externalId: 'pay_00008',
      amount: '500.00',
      currency: 'INR',
      status: 'CAPTURED',
      version: 3,
    });
    tx.mutationProposal.create.mockImplementation(({ data }) => ({
      id: 'proposal-a',
      ...data,
      status: 'PENDING_APPROVAL',
      operation: 'UPDATE',
    }));
    const proposal = await service.propose(
      principal,
      {
        entityType: FinancialRecordType.TRANSACTION,
        recordId: 'pay_00008',
        changes: { status: 'REFUNDED' },
        reason: 'Correct the status.',
      },
      { writeMode: true, threadId: 'thread-a' },
    );
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-a',
        OR: [{ id: 'pay_00008' }, { externalId: 'pay_00008' }],
      },
    });
    expect(proposal.diff).toEqual([{ field: 'status', before: 'CAPTURED', after: 'REFUNDED' }]);
    expect(writer.execute).not.toHaveBeenCalled();
  });

  it('executes only a pending tenant-scoped proposal after approval', async () => {
    const { service, prisma, writer } = setup();
    prisma.mutationProposal.findFirst.mockResolvedValue({
      id: 'proposal-a',
      organizationId: 'org-a',
      requestedById: 'controller-a',
      entityType: 'TRANSACTION',
      entityId: 'transaction-a',
      recordExternalId: 'pay_00008',
      status: 'PENDING_APPROVAL',
      operation: 'UPDATE',
      reason: 'Correct the status.',
      before: { status: 'CAPTURED' },
      after: { status: 'REFUNDED' },
      diff: [{ field: 'status', before: 'CAPTURED', after: 'REFUNDED' }],
      expectedVersion: 3,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    writer.execute.mockResolvedValue({ status: 'EXECUTED' });
    await service.approve(principal, 'proposal-a');
    expect(prisma.mutationProposal.findFirst).toHaveBeenCalledWith({
      where: { id: 'proposal-a', organizationId: 'org-a' },
    });
    expect(writer.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: 'proposal-a',
        entityId: 'transaction-a',
        expectedVersion: 3,
        principal,
      }),
    );
  });
});
