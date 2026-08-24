import type { AiGateway as AgentAiGateway, SettlementExplanationInput } from '@finora/agents';
import { apiLogger } from '../../common/api-logger.js';
import type { AiGateway } from './ai.gateway.js';

export class ExceptionInvestigatorAiGateway implements AgentAiGateway {
  constructor(private readonly ai: AiGateway) {}

  async explainSettlement(input: SettlementExplanationInput): Promise<string> {
    const fallback = input.fullyExplained
      ? 'The documented settlement adjustments account for the variance.'
      : 'The remaining settlement variance needs finance review.';
    try {
      const completion = await this.ai.complete({
        system:
          'You are an evidence-grounded finance operations assistant. Reply with one concise sentence. Do not include numbers, money, identifiers, calculations, or any facts beyond the supplied conclusion.',
        prompt: input.fullyExplained
          ? 'Explain qualitatively that documented settlement adjustments fully account for the variance.'
          : 'Explain qualitatively that the remaining settlement variance requires finance review.',
      });
      const text = completion.text.replace(/\s+/g, ' ').trim();
      if (!text || text.length > 280 || /[0-9₹$]/.test(text)) {
        apiLogger.warn('Agent explanation did not satisfy output guardrail', {
          provider: completion.provider,
          model: completion.model,
        });
        return fallback;
      }
      apiLogger.info('Exception investigator received AI explanation', {
        provider: completion.provider,
        model: completion.model,
        fallbackFrom: completion.fallbackFrom,
      });
      return text;
    } catch (error) {
      apiLogger.warn('Exception investigator AI explanation fell back to deterministic copy', {
        error: error instanceof Error ? error.message : 'Unknown AI gateway error',
      });
      return fallback;
    }
  }
}
