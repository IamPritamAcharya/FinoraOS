import { describe, expect, it, vi } from 'vitest';
import { BudgetStatus, WorkspaceRole, type RequestPrincipal } from '@finora/platform';
import { WorkspaceService } from './workspace.service.js';

const controller: RequestPrincipal = {
  organizationId: 'org-a',
  userId: 'controller-a',
  role: WorkspaceRole.FINANCE_CONTROLLER,
};

const employee: RequestPrincipal = {
  organizationId: 'org-a',
  userId: 'employee-a',
  role: WorkspaceRole.EMPLOYEE,
};

const serviceWith = (overrides: Record<string, unknown> = {}) => {
  const tx = {
    budget: {
      create: vi.fn().mockResolvedValue({
        id: 'budget-a',
        nodeId: 'node-a',
        amount: { toFixed: () => '100000.00' },
        currency: 'INR',
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
  const prisma = {
    expenseClaim: { findMany: vi.fn().mockResolvedValue([]) },
    organizationNode: { findFirst: vi.fn().mockResolvedValue({ id: 'node-a' }) },
    notification: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    ...overrides,
  };
  const messaging = { sendDirectMessage: vi.fn() };
  const documents = { store: vi.fn() };
  const ai = { complete: vi.fn() };
  return {
    service: new WorkspaceService(prisma as never, messaging, documents, ai),
    prisma,
    tx,
  };
};

describe('WorkspaceService authorization and tenant scope', () => {
  it('limits an employee expense query to the signed-in member and organization', async () => {
    const { service, prisma } = serviceWith();
    await service.expenses(employee);
    expect(prisma.expenseClaim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-a', claimantUserId: 'employee-a' },
      }),
    );
  });

  it('creates a budget only after resolving its node inside the tenant and audits it', async () => {
    const { service, prisma, tx } = serviceWith();
    await service.createBudget(controller, {
      nodeId: 'node-a',
      name: 'August operating budget',
      amount: '100000.00',
      currency: 'INR',
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      status: BudgetStatus.ACTIVE,
    });
    expect(prisma.organizationNode.findFirst).toHaveBeenCalledWith({
      where: { id: 'node-a', organizationId: 'org-a' },
      select: { id: true },
    });
    expect(tx.budget.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org-a' }) }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'BUDGET_CREATED' }) }),
    );
  });

  it('does not create a budget for a node outside the tenant', async () => {
    const { service, prisma, tx } = serviceWith();
    prisma.organizationNode.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.createBudget(controller, {
        nodeId: 'foreign-node',
        name: 'Foreign budget',
        amount: '100000.00',
        currency: 'INR',
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-08-31T00:00:00.000Z'),
        status: BudgetStatus.ACTIVE,
      }),
    ).rejects.toThrow('Organization node not found.');
    expect(tx.budget.create).not.toHaveBeenCalled();
  });

  it('does not let employee-defined skills grant unapproved tools', async () => {
    const { service } = serviceWith();
    await expect(
      service.createSkill(controller, {
        name: 'Unsafe procedure',
        description: 'Attempts to escape controlled finance tools.',
        instructions: 'Run an unapproved database mutation directly.',
        allowedTools: ['executeSql'],
      }),
    ).rejects.toThrow('Skills cannot grant unsupported tools');
  });

  it('scopes notifications to both the tenant and current user', async () => {
    const { service, prisma } = serviceWith();
    await service.notifications(employee);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-a', userId: 'employee-a' },
      }),
    );
  });
});
