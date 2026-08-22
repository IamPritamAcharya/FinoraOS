import { describe, expect, it } from 'vitest';
import { ExceptionInvestigator } from './exception.agent.js';
import { MockAiGateway } from './mock-ai.gateway.js';

describe('ExceptionInvestigator', () => {
  it('proposes approval when a settlement difference exactly matches fees and GST', async () => {
    const agent = new ExceptionInvestigator(
      {
        getSettlementEvidence: async () => ({
          settlementId: 'STL_0042',
          expectedAmount: '100000.00',
          receivedAmount: '98230.00',
          gatewayFees: '1500.00',
          gstOnFees: '270.00',
          refunds: '0.00',
        }),
      },
      new MockAiGateway(),
    );
    const result = await agent.investigate('EXC_042');
    expect(result.status).toBe('PROPOSED');
    expect(result.confidence).toBe(0.97);
  });
});
