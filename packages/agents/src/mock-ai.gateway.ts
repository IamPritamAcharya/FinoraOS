import type { AiGateway, SettlementExplanationInput } from './types.js';

export class MockAiGateway implements AiGateway {
  async explainSettlement(input: SettlementExplanationInput): Promise<string> {
    return input.fullyExplained
      ? 'The documented settlement adjustments account for the variance.'
      : 'The remaining settlement variance needs finance review.';
  }
}
