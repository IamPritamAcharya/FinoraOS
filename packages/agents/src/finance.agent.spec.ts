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
  it('does not allow a mutation proposal while write mode is disabled', async () => {
    const execute = vi.fn();
    const model = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          type: 'tool',
          call: {
            tool: 'proposeRecordUpdate',
            arguments: {
              entityType: 'TRANSACTION',
              recordId: 'pay_00008',
              changes: { status: 'REFUNDED' },
              reason: 'Correct the payment status.',
            },
          },
        }),
      ),
    };
    const result = await new FinanceAgent(model, { execute }).run({
      message: 'Change pay_00008 to refunded.',
      currentDate: '2026-08-28T00:00:00.000Z',
      writeMode: false,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(result.text).toContain('Write mode is off');
  });

  it('prepares a typed mutation proposal when write mode is explicitly enabled', async () => {
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'proposeRecordUpdate',
      summary: 'Prepared a one-field diff; nothing has been written yet.',
      data: { id: 'proposal-1', status: 'PENDING_APPROVAL' },
      artifact: { type: 'mutation', title: 'Proposed change', data: {} },
    });
    const model = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          type: 'tool',
          call: {
            tool: 'proposeRecordUpdate',
            arguments: {
              entityType: 'TRANSACTION',
              recordId: 'pay_00008',
              changes: { status: 'REFUNDED' },
              reason: 'Correct the payment status.',
            },
          },
        }),
      ),
    };
    const result = await new FinanceAgent(model, { execute }, 1).run({
      message: 'Change pay_00008 to refunded.',
      currentDate: '2026-08-28T00:00:00.000Z',
      writeMode: true,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(result.text).toContain('nothing has been written');
  });

  it('prepares an explicit payment status diff without asking the model to route it', async () => {
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'proposeRecordUpdate',
      summary: 'Prepared a one-field diff; nothing has been written yet.',
      data: { id: 'proposal-1', status: 'PENDING_APPROVAL' },
    });
    const model = { complete: vi.fn() };
    await new FinanceAgent(model, { execute }).run({
      message: 'Change pay_00008 status to refunded.',
      currentDate: '2026-08-28T00:00:00.000Z',
      writeMode: true,
    });
    expect(execute).toHaveBeenCalledWith(
      {
        tool: 'proposeRecordUpdate',
        arguments: {
          entityType: 'TRANSACTION',
          recordId: 'pay_00008',
          changes: { status: 'REFUNDED' },
          reason: "Change pay_00008 status to REFUNDED at the user's explicit request.",
        },
      },
      'call-1',
    );
    expect(model.complete).not.toHaveBeenCalled();
  });

  it('keeps a pending payment mutation when the final turn only supplies its reference', async () => {
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'proposeRecordUpdate',
      summary: 'Prepared a one-field diff; nothing has been written yet.',
      data: { id: 'proposal-1', status: 'PENDING_APPROVAL' },
    });
    const model = { complete: vi.fn() };
    await new FinanceAgent(model, { execute }).run({
      message: 'pay_00008',
      context: [
        { role: 'user', text: 'Change the payment status to refunded.' },
        { role: 'assistant', text: 'What is the exact pay_##### reference?' },
      ],
      currentDate: '2026-08-28T00:00:00.000Z',
      writeMode: true,
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'proposeRecordUpdate',
        arguments: expect.objectContaining({
          entityType: 'TRANSACTION',
          recordId: 'pay_00008',
          changes: { status: 'REFUNDED' },
        }),
      }),
      'call-1',
    );
    expect(model.complete).not.toHaveBeenCalled();
  });

  it('answers budget questions from deterministic budget evidence without looping', async () => {
    const model = { complete: vi.fn() };
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'getBudgetSummary',
      summary: '3 budgets allocate ₹30,45,000.00 with ₹28,97,000.00 remaining.',
      data: { count: 3, allocated: '3045000.00', remaining: '2897000.00' },
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
    expect(execute).toHaveBeenCalledWith({ tool: 'getBudgetSummary', arguments: {} }, 'call-1');
    expect(model.complete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      clarified: false,
      text: expect.stringContaining('3 budgets'),
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

  it.each([
    ['Explain INV_0004', 'getInvoice', { invoiceId: 'INV_0004' }, ['getInvoice'] as const],
    [
      'What happened to GST_0007?',
      'getTaxLine',
      { taxLineId: 'GST_0007' },
      ['getTaxLine'] as const,
    ],
    [
      'Investigate EXC_JRIW3B_012',
      'investigateException',
      { exceptionId: 'EXC_JRIW3B_012' },
      ['investigateException'] as const,
    ],
  ])(
    'routes the exact record in “%s” without model ambiguity',
    async (message, tool, args, allowed) => {
      const execute = vi.fn().mockResolvedValue({
        callId: 'call-1',
        tool,
        summary: `Loaded ${message}`,
        data: {},
      });
      const model = { complete: vi.fn() };
      await new FinanceAgent(model, { execute }).run({
        message,
        currentDate: '2026-08-26T00:00:00.000Z',
        actor: { role: 'FINANCE_CONTROLLER', allowedTools: [...allowed] },
      });
      expect(execute).toHaveBeenCalledWith({ tool, arguments: args }, 'call-1');
      expect(model.complete).not.toHaveBeenCalled();
    },
  );

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

  it('applies an active workspace skill only within its tool allowlist', async () => {
    const skill = {
      id: 'skill-1',
      name: 'Month-end variance review',
      description: 'Review settlement variance evidence.',
      instructions: 'Load the settlement summary before explaining the month-end variance.',
      allowedTools: ['getSettlementSummary' as const],
    };
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'getSettlementSummary',
      summary: 'Settlement variance is fully explained.',
      data: { unexplained: '0.00' },
    });
    const model = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          type: 'tool',
          skillId: 'skill-1',
          call: { tool: 'getSettlementSummary', arguments: {} },
        }),
      ),
    };
    const result = await new FinanceAgent(model, { execute }, 1).run({
      message: 'Run our month-end variance review.',
      currentDate: '2026-08-26T00:00:00.000Z',
      skills: [skill],
    });
    expect(result.skillId).toBe('skill-1');
    expect(execute).toHaveBeenCalledOnce();
  });

  it('does not let a workspace skill call a tool outside its allowlist', async () => {
    const execute = vi.fn();
    const model = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          type: 'tool',
          skillId: 'skill-1',
          call: { tool: 'findAuditEvents', arguments: {} },
        }),
      ),
    };
    const result = await new FinanceAgent(model, { execute }, 1).run({
      message: 'Use the settlement procedure.',
      currentDate: '2026-08-26T00:00:00.000Z',
      skills: [
        {
          id: 'skill-1',
          name: 'Settlement procedure',
          description: 'Review settlement evidence.',
          instructions: 'Load settlement totals.',
          allowedTools: ['getSettlementSummary'],
        },
      ],
    });
    expect(execute).not.toHaveBeenCalled();
    expect(result.fallbackReason).toBe('INVALID_DECISION');
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
    }).run({
      message: 'Compare expenses and settlements.',
      currentDate: '2026-08-26T00:00:00.000Z',
    });
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

  it('routes an employee natural-language receipt question to only their own claims', async () => {
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'findMyExpenses',
      summary: 'I found 2 of your expense claims. Each still needs receipt evidence.',
      data: [],
    });
    const model = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          type: 'tool',
          call: { tool: 'findMyExpenses', arguments: { missingReceipt: true } },
        }),
      ),
    };
    const result = await new FinanceAgent(model, { execute }, 1).run({
      message: 'Which of my expenses still need receipts?',
      currentDate: '2026-08-26T00:00:00.000Z',
      actor: {
        role: 'EMPLOYEE',
        allowedTools: [
          'getWorkspaceCapabilities',
          'getCurrentUser',
          'getMyExpenseSummary',
          'findMyExpenses',
        ],
      },
    });
    expect(execute).toHaveBeenCalledWith(
      { tool: 'findMyExpenses', arguments: { missingReceipt: true } },
      'call-1',
    );
    expect(result.text).toContain('your expense claims');
  });

  it('does not execute an organization-wide tool selected for an employee', async () => {
    const execute = vi.fn();
    const model = {
      complete: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ type: 'tool', call: { tool: 'getOrganizationSummary', arguments: {} } }),
        ),
    };
    const result = await new FinanceAgent(model, { execute }, 2).run({
      message: 'How many transactions does the company have?',
      currentDate: '2026-08-26T00:00:00.000Z',
      actor: {
        role: 'EMPLOYEE',
        allowedTools: [
          'getWorkspaceCapabilities',
          'getCurrentUser',
          'getMyExpenseSummary',
          'findMyExpenses',
        ],
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(result.text).toContain('expense claims');
  });

  it('recovers a common finance intent when the model returns invalid output', async () => {
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'getCashForecast',
      summary: 'No shortfall appears in the known cash schedule.',
      data: [],
    });
    const result = await new FinanceAgent(
      { complete: vi.fn().mockResolvedValue('not-json') },
      { execute },
      2,
    ).run({
      message: 'Do we have enough cash runway?',
      currentDate: '2026-08-26T00:00:00.000Z',
      actor: { role: 'FINANCE_CONTROLLER', allowedTools: ['getCashForecast'] },
    });
    expect(execute).toHaveBeenCalledWith({ tool: 'getCashForecast', arguments: {} }, 'call-1');
    expect(result.text).toContain('No shortfall');
  });

  it('answers a greeting naturally without calling the model or finance tools', async () => {
    const model = { complete: vi.fn() };
    const execute = vi.fn();
    const result = await new FinanceAgent(model, { execute }).run({
      message: 'Hi Finora',
      currentDate: '2026-08-26T00:00:00.000Z',
      actor: { role: 'FINANCE_CONTROLLER', allowedTools: [] },
    });
    expect(result.text).toContain('Ask me about payments');
    expect(model.complete).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('gives employees role-appropriate examples without exposing organization tools', async () => {
    const model = { complete: vi.fn() };
    const execute = vi.fn();
    const result = await new FinanceAgent(model, { execute }).run({
      message: 'What can you do?',
      currentDate: '2026-08-26T00:00:00.000Z',
      actor: { role: 'EMPLOYEE', allowedTools: ['getMyExpenseSummary', 'findMyExpenses'] },
    });
    expect(result.text).toContain('your expense claims');
    expect(result.text).not.toContain('payments, settlements');
    expect(model.complete).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('routes a last-month expense summary with an exact deterministic period', async () => {
    const model = { complete: vi.fn() };
    const execute = vi.fn().mockResolvedValue(expenseObservation);
    await new FinanceAgent(model, { execute }).run({
      message: 'Summarise our expenses last month.',
      currentDate: '2026-08-26T00:00:00.000Z',
      actor: { role: 'FINANCE_CONTROLLER', allowedTools: ['getExpenseSummary'] },
    });
    expect(execute).toHaveBeenCalledWith(
      {
        tool: 'getExpenseSummary',
        arguments: {
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-07-31T23:59:59.999Z',
        },
      },
      'call-1',
    );
    expect(model.complete).not.toHaveBeenCalled();
  });

  it('routes the exact demo read-mode prompts without model-dependent planning', async () => {
    const model = { complete: vi.fn() };
    const execute = vi.fn().mockResolvedValueOnce(expenseObservation).mockResolvedValueOnce({
      callId: 'call-1',
      tool: 'getCashForecast',
      summary: 'The seven-day cash outlook is available.',
      data: [],
    });
    const agent = new FinanceAgent(model, { execute });
    const actor = {
      role: 'FINANCE_CONTROLLER',
      allowedTools: ['getExpenseSummary', 'getCashForecast'] as const,
    };

    await agent.run({
      message: 'Summarise our expenses last month and tell me the largest category.',
      currentDate: '2026-09-03T00:00:00.000Z',
      actor: { role: actor.role, allowedTools: [...actor.allowedTools] },
    });
    await agent.run({
      message: 'What is our seven-day cash outlook?',
      currentDate: '2026-09-03T00:00:00.000Z',
      actor: { role: actor.role, allowedTools: [...actor.allowedTools] },
    });

    expect(execute).toHaveBeenNthCalledWith(
      1,
      {
        tool: 'getExpenseSummary',
        arguments: {
          from: '2026-08-01T00:00:00.000Z',
          to: '2026-08-31T23:59:59.999Z',
        },
      },
      'call-1',
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      { tool: 'getCashForecast', arguments: {} },
      'call-1',
    );
    expect(model.complete).not.toHaveBeenCalled();
  });

  it('lists transactions above an amount despite a common transaction typo', async () => {
    const model = { complete: vi.fn() };
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'findTransactions',
      summary: 'I found 7 transactions above ₹50,000.00.',
      data: [],
    });
    await new FinanceAgent(model, { execute }).run({
      message: 'Show trasntions above ₹50,000',
      currentDate: '2026-08-26T00:00:00.000Z',
      actor: { role: 'FINANCE_CONTROLLER', allowedTools: ['findTransactions'] },
    });
    expect(execute).toHaveBeenCalledWith(
      { tool: 'findTransactions', arguments: { minimumAmount: '50000' } },
      'call-1',
    );
    expect(model.complete).not.toHaveBeenCalled();
  });
});
