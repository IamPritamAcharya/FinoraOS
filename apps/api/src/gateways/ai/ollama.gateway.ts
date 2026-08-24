import { Injectable } from '@nestjs/common';
import { apiLogger } from '../../common/api-logger.js';
import type { AiGateway, AiPrompt } from './ai.gateway.js';
@Injectable()
export class OllamaGateway implements AiGateway {
  async complete(input: AiPrompt) {
    const model = process.env.AI_MODEL ?? 'qwen3:4b-instruct-2507-q4_K_M';
    const startedAt = performance.now();
    apiLogger.info('AI completion started', { provider: 'ollama', model });
    const response = await fetch(
      `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/api/chat`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.prompt },
          ],
        }),
      },
    );
    if (!response.ok) {
      apiLogger.warn('AI completion failed', {
        provider: 'ollama',
        model,
        statusCode: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw new Error(`Ollama returned ${response.status}`);
    }
    const text = ((await response.json()) as { message: { content: string } }).message.content;
    apiLogger.info('AI completion completed', {
      provider: 'ollama',
      model,
      durationMs: Math.round(performance.now() - startedAt),
      responseLength: text.length,
    });
    return { text, provider: 'ollama' as const, model };
  }
}
