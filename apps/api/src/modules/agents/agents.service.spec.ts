import { describe, expect, it, vi } from 'vitest';
import { AgentsService } from './agents.service.js';

const prismaMock = () => {
  const transactionClient = {
    exception: { update: vi.fn().mockResolvedValue({ id: 'exception-1' }) },
    agentRun: { create: vi.fn().mockResolvedValue({ id: 'agent-run-1' }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  return {
    exception: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'exception-1',
        organizationId: 'demo-org',
        evidence: [
          {
            payload: {
              settlementId: 'STL_0001',
              expectedAmount: '100000.00',
              receivedAmount: '98230.00',
              gatewayFees: '1500.00',
              gstOnFees: '270.00',
              refunds: '0.00',
            },
          },
        ],
      }),
    },
    $transaction: vi.fn((callback) => callback(transactionClient)),
    __transactionClient: transactionClient,
  };
};

describe('AgentsService.investigate', () => {
  it('uses the configured API gateway through the exception investigator', async () => {
    const prisma = prismaMock();
    const ai = {
      complete: vi.fn().mockResolvedValue({
        text: 'The documented adjustments account for the variance.',
        provider: 'ollama',
        model: 'qwen3:4b-instruct-2507-q4_K_M',
      }),
    };
    const service = new AgentsService(prisma as never, ai);

    const result = await service.investigate('exception-1');

    expect(ai.complete).toHaveBeenCalledOnce();
    expect(result.status).toBe('PROPOSED');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.__transactionClient.agentRun.create).toHaveBeenCalledOnce();
    expect(prisma.__transactionClient.exception.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROPOSED' }) }),
    );
    expect(prisma.__transactionClient.auditLog.create).toHaveBeenCalledOnce();
  });
});
