import { Injectable } from '@nestjs/common';
import type { AiGateway, AiPrompt } from './ai.gateway.js';
@Injectable()
export class MockAiGateway implements AiGateway {
  async complete(input: AiPrompt) {
    return {
      text: `Finora evaluated this request using controlled finance tools. ${input.prompt}`,
      provider: 'mock' as const,
      model: 'deterministic-mock',
    };
  }
}
