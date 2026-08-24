import { describe, expect, it } from 'vitest';
import { ControllerAgent } from './controller.agent.js';

describe('ControllerAgent', () => {
  const controller = new ControllerAgent();

  it('routes explicit finance references to controlled tools', () => {
    expect(controller.route('Explain STL_0001.')).toEqual({
      intent: 'SETTLEMENT_LOOKUP',
      reference: 'STL_0001',
    });
    expect(controller.route('Investigate EXC_005.')).toEqual({
      intent: 'EXCEPTION_INVESTIGATION',
      reference: 'EXC_005',
    });
    expect(controller.route('Why is EXC_005 unresolved?')).toEqual({
      intent: 'EXCEPTION_LOOKUP',
      reference: 'EXC_005',
    });
  });

  it('uses bounded conversation context only for approved follow-up tools', () => {
    expect(
      controller.route('What does the gateway fee mean?', [
        { role: 'user', text: 'Explain STL_0001.' },
      ]),
    ).toEqual({ intent: 'SETTLEMENT_LOOKUP', reference: 'STL_0001' });
  });

  it('routes list, forecast and tax prompts without model-generated SQL', () => {
    expect(controller.route('Show unresolved exceptions above ₹25,000.')).toEqual({
      intent: 'EXCEPTION_LIST',
      minimumAmount: '25000',
    });
    expect(controller.route('What is our expected cash position this week?')).toEqual({
      intent: 'CASH_FORECAST',
    });
    expect(controller.route('Which GST lines failed to match?')).toEqual({
      intent: 'TAX_MISMATCH_LIST',
    });
  });
});
