import { describe, expect, it, vi } from 'vitest';
import { FinanceAgent, type ToolObservation } from './finance.agent.js';

const expenseObservation: ToolObservation = {
  callId: 'call-1',
  tool: 'getExpenseSummary',
  summary: 'Recorded expenses total ₹8,97,350.00 across 49 outflows.',
  data: { total: '897350.00', count: 49 },
  artifact: { type: 'metrics', title: 'Expense summary', data: { total: '897350.00' } },
};

describe('FinanceAgent', () => {
  it('answers budget questions from workspace capability evidence without looping', async () => {
    const model = { complete: vi.fn() };
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'getWorkspaceCapabilities',
      summary: 'Operating budgets are not configured in this workspace yet.',
      data: { unavailable: ['operating budgets'] },
    });
    const result = await new FinanceAgent(model, { execute }).run({
      message: 'What is our monthly operating budget?',
      context: [
        {
          role: 'assistant',
          text: 'Are you referring to a monthly operating budget or a cash flow forecast?',
        },
      ],
      currentDate: '2026-08-26T00:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith(
      { tool: 'getWorkspaceCapabilities', arguments: { topic: 'BUDGETS' } },
      'call-1',
    );
    expect(model.complete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      clarified: false,
      text: expect.stringContaining('not configured'),
    });
  });

  it('loads an exact payment reference deterministically', async () => {
    const model = { complete: vi.fn() };
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'getTransaction',
      summary: 'pay_00008 is a captured payment of ₹50,000.00.',
      data: { externalId: 'pay_00008', amount: '50000.00' },
    });
    const result = await new FinanceAgent(model, { execute }).run({
      message: 'whats PAY_00008',
      currentDate: '2026-08-26T00:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith(
      { tool: 'getTransaction', arguments: { transactionId: 'pay_00008' } },
      'call-1',
    );
    expect(result.text).toContain('pay_00008');
    expect(model.complete).not.toHaveBeenCalled();
  });

  it('resolves a pronoun from only the immediately preceding controlled record', async () => {
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'getTransaction',
      summary: 'pay_00008 is a captured payment of ₹14,037.00.',
      data: { externalId: 'pay_00008' },
    });
    await new FinanceAgent({ complete: vi.fn() }, { execute }).run({
      message: 'show me everything about it',
      context: [
        { role: 'user', text: 'whats pay_00008' },
        { role: 'assistant', text: 'pay_00008 is a captured payment of ₹14,037.00.' },
      ],
      currentDate: '2026-08-26T00:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith(
      { tool: 'getTransaction', arguments: { transactionId: 'pay_00008' } },
      'call-1',
    );
  });

  it('loads the newest payment for a latest-transaction request, including a typo', async () => {
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'findTransactions',
      summary: 'pay_00120 is the latest matching payment.',
      data: [{ externalId: 'pay_00120' }],
    });
    await new FinanceAgent({ complete: vi.fn() }, { execute }).run({
      message: 'tell me our last trasntion data',
      currentDate: '2026-08-26T00:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith(
      { tool: 'findTransactions', arguments: { limit: 1 } },
      'call-1',
    );
  });

  it('executes a finance tool and synthesizes its evidence', async () => {
    const model = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            type: 'tool',
            call: {
              tool: 'getExpenseSummary',
              arguments: {
                from: '2026-08-01T00:00:00.000Z',
                to: '2026-08-31T23:59:59.999Z',
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            type: 'answer',
            answer: 'Your recorded expenses total ₹8,97,350.00 across 49 outflows.',
            citations: ['call-1'],
          }),
        ),
    };
    const tools = { execute: vi.fn().mockResolvedValue(expenseObservation) };
    const result = await new FinanceAgent(model, tools).run({
      message: 'Tell me about our expenses.',
      currentDate: '2026-08-26T00:00:00.000Z',
    });
    expect(tools.execute).toHaveBeenCalledOnce();
    expect(result.text).toContain('₹8,97,350.00');
    expect(result.observations).toHaveLength(1);
  });

  it('rejects an invented amount and falls back to deterministic evidence', async () => {
    const model = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            type: 'tool',
            call: {
              tool: 'getExpenseSummary',
              arguments: {
                from: '2026-08-01T00:00:00.000Z',
                to: '2026-08-31T23:59:59.999Z',
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            type: 'answer',
            answer: 'Your expenses are ₹99,99,999.00.',
            citations: ['call-1'],
          }),
        ),
    };
    const result = await new FinanceAgent(model, {
      execute: vi.fn().mockResolvedValue(expenseObservation),
    }).run({ message: 'Tell me about expenses.', currentDate: '2026-08-26T00:00:00.000Z' });
    expect(result.text).toBe(expenseObservation.summary);
    expect(result.fallbackReason).toBe('INVALID_DECISION');
  });

  it('returns one clarification without executing a tool', async () => {
    const tools = { execute: vi.fn() };
    const result = await new FinanceAgent(
      {
        complete: vi
          .fn()
          .mockResolvedValue(
            JSON.stringify({ type: 'clarify', question: 'Which period should I compare?' }),
          ),
      },
      tools,
    ).run({ message: 'Compare our costs.', currentDate: '2026-08-26T00:00:00.000Z' });
    expect(result).toMatchObject({ text: 'Which period should I compare?', clarified: true });
    expect(tools.execute).not.toHaveBeenCalled();
  });

  it('does not repeat an assistant clarification already present in context', async () => {
    const execute = vi.fn().mockResolvedValue(expenseObservation);
    const model = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({ type: 'clarify', question: 'Which period should I compare?' }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({ type: 'tool', call: { tool: 'getExpenseSummary', arguments: {} } }),
        ),
    };
    const result = await new FinanceAgent(model, { execute }).run({
      message: 'Tell me about the expenses instead.',
      context: [{ role: 'assistant', text: 'Which period should I compare?' }],
      currentDate: '2026-08-26T00:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(result.clarified).toBe(false);
    expect(result.text).toContain('Recorded expenses');
  });

  it('executes a multi-tool plan for a multi-part question', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        callId: 'call-1',
        tool: 'getOrganizationSummary',
        summary: 'This organization has 1 member.',
        data: { users: 1 },
      })
      .mockResolvedValueOnce({
        callId: 'call-2',
        tool: 'getCurrentUser',
        summary: 'Your email is finance@finora.local.',
        data: { email: 'finance@finora.local' },
      });
    const model = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            type: 'tools',
            calls: [
              { tool: 'getOrganizationSummary', arguments: {} },
              { tool: 'getCurrentUser', arguments: {} },
            ],
          }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            type: 'answer',
            answer: 'Your organization has 1 member and your email is finance@finora.local.',
            citations: ['call-1', 'call-2'],
          }),
        ),
    };
    const result = await new FinanceAgent(model, { execute }).run({
      message: 'How many members do we have, and what is my email?',
      currentDate: '2026-08-26T00:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.text).toContain('finance@finora.local');
  });

  it('normalizes common model filter aliases before executing a controlled tool', async () => {
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'findTransactions',
      summary: 'I found 2 payment transactions matching those filters.',
      data: [],
      artifact: { type: 'table', title: 'Transactions', data: { rows: [] } },
    });
    const model = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          type: 'tool',
          call: {
            tool: 'findTransactions',
            arguments: { status: 'captured', min_amount: 20000 },
          },
        }),
      ),
    };
    await new FinanceAgent(model, { execute }).run({
      message: 'Show captured transactions above ₹20,000.',
      currentDate: '2026-08-26T00:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'findTransactions',
        arguments: expect.objectContaining({ minimumAmount: '20000', status: 'CAPTURED' }),
      }),
      'call-1',
    );
  });
});
