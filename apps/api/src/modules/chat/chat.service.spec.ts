import { describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service.js';

describe('ChatService', () => {
  it('uses the configured AI gateway for a general conversational question', async () => {
    const ai = {
      complete: vi.fn().mockResolvedValue({
        text: 'I am Finora, your finance operations assistant.',
        provider: 'ollama',
        model: 'qwen3:4b-instruct-2507-q4_K_M',
      }),
    };
    const finance = { settlements: vi.fn().mockResolvedValue([]) };
    const agents = { investigateByExternalId: vi.fn() };
    const reconciliation = { exceptionByExternalId: vi.fn(), exceptionsForChat: vi.fn() };
    const service = new ChatService(ai, finance as never, agents as never, reconciliation as never);

    const result = await service.respond('Who are you?');

    expect(ai.complete).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      kind: 'general',
      text: 'I am Finora, your finance operations assistant.',
    });
  });

  it('routes a controlled exception reference to the investigator instead of general chat', async () => {
    const ai = { complete: vi.fn() };
    const finance = { settlements: vi.fn().mockResolvedValue([]) };
    const agents = {
      investigateByExternalId: vi.fn().mockResolvedValue({
        externalId: 'EXC_005',
        result: {
          status: 'PROPOSED',
          confidence: 0.97,
          reason: 'The settlement difference exactly equals fees, GST and refunds.',
          explanation: 'The documented settlement adjustments account for the variance.',
          proposedActions: [
            {
              type: 'CREATE_SETTLEMENT_FEE_ADJUSTMENT',
              requiresApproval: true,
              payload: { settlementId: 'STL_0005' },
            },
          ],
        },
      }),
    };
    const reconciliation = { exceptionByExternalId: vi.fn(), exceptionsForChat: vi.fn() };
    const service = new ChatService(ai, finance as never, agents as never, reconciliation as never);

    const result = await service.respond('Investigate EXC_005.');

    expect(agents.investigateByExternalId).toHaveBeenCalledWith('EXC_005');
    expect(ai.complete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: 'exception-investigation',
      exception: { status: 'PROPOSED' },
    });
  });

  it('uses a prior settlement reference for a controlled follow-up without sending it to general AI', async () => {
    const ai = {
      complete: vi.fn().mockResolvedValue({
        text: 'The recorded adjustments explain the result.',
        provider: 'mock',
        model: 'mock',
      }),
    };
    const finance = {
      settlements: vi.fn().mockResolvedValue([
        {
          externalId: 'STL_0001',
          expectedAmount: '100000.00',
          receivedAmount: '98230.00',
          feeAmount: '1500.00',
          gstAmount: '270.00',
          refundAmount: '0.00',
        },
      ]),
    };
    const agents = { investigateByExternalId: vi.fn() };
    const reconciliation = { exceptionByExternalId: vi.fn(), exceptionsForChat: vi.fn() };
    const service = new ChatService(ai, finance as never, agents as never, reconciliation as never);

    const result = await service.respond('What does the gateway fee mean?', [
      { role: 'user', text: 'Explain STL_0001.' },
    ]);

    expect(result).toMatchObject({ kind: 'settlement', settlement: { externalId: 'STL_0001' } });
  });

  it('keeps exception read queries read-only until an explicit investigation command', async () => {
    const ai = { complete: vi.fn() };
    const finance = { settlements: vi.fn().mockResolvedValue([]) };
    const agents = { investigateByExternalId: vi.fn() };
    const reconciliation = {
      exceptionByExternalId: vi.fn().mockResolvedValue({
        externalId: 'EXC_005',
        status: 'OPEN',
        expectedAmount: '100000.00',
        receivedAmount: '98230.00',
        reason: 'Settlement difference requires investigation.',
        resolution: null,
      }),
      exceptionsForChat: vi.fn(),
    };
    const service = new ChatService(ai, finance as never, agents as never, reconciliation as never);

    const result = await service.respond('Why is EXC_005 unresolved?');

    expect(result).toMatchObject({ kind: 'exception', exception: { externalId: 'EXC_005' } });
    expect(agents.investigateByExternalId).not.toHaveBeenCalled();
    expect(ai.complete).not.toHaveBeenCalled();
  });
});
