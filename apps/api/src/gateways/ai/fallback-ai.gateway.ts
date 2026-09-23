import { apiLogger } from '../../common/api-logger.js';
import type { AiGateway, AiPrompt } from './ai.gateway.js';
import type { AiProvider } from './provider-selection.js';

export class FallbackAiGateway implements AiGateway {
  constructor(
    private readonly primary: AiGateway,
    private readonly fallback: AiGateway,
    private readonly primaryProvider: AiProvider,
  ) {}

  async complete(input: AiPrompt) {
    try {
      return await this.primary.complete(input);
    } catch (error) {
      // Fallback preserves the same gateway contract; callers do not retry or branch by provider.
      apiLogger.warn('Hosted AI provider failed; retrying with local Ollama', {
        fallbackProvider: 'ollama',
        error: error instanceof Error ? error.message : 'Unknown provider error',
      });
      const completion = await this.fallback.complete(input);
      return { ...completion, fallbackFrom: this.primaryProvider };
    }
  }
}
