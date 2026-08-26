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
