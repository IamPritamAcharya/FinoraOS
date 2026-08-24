import { Injectable } from '@nestjs/common';
import { apiLogger } from '../../common/api-logger.js';
import type { AiGateway, AiPrompt } from './ai.gateway.js';

type OpenAiCompatibleResponse = { choices?: Array<{ message?: { content?: string | null } }> };

type OpenAiCompatibleConfig = {
  provider: 'groq' | 'openrouter';
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
};

class OpenAiCompatibleGateway implements AiGateway {
  constructor(private readonly config: OpenAiCompatibleConfig) {}

  async complete(input: AiPrompt) {
    if (!this.config.apiKey) {
      throw new Error(`${this.config.provider.toUpperCase()} API key is required.`);
    }
    const startedAt = performance.now();
    apiLogger.info('AI completion started', {
      provider: this.config.provider,
      model: this.config.model,
    });
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.prompt },
        ],
      }),
    });
    if (!response.ok) {
      apiLogger.warn('AI completion failed', {
        provider: this.config.provider,
        model: this.config.model,
        statusCode: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw new Error(`${this.config.provider} returned ${response.status}`);
    }
    const text = ((await response.json()) as OpenAiCompatibleResponse).choices?.[0]?.message
      ?.content;
    if (!text?.trim()) throw new Error(`${this.config.provider} returned an empty completion.`);
    apiLogger.info('AI completion completed', {
      provider: this.config.provider,
      model: this.config.model,
      durationMs: Math.round(performance.now() - startedAt),
      responseLength: text.length,
    });
    return { text, provider: this.config.provider, model: this.config.model };
  }
}

@Injectable()
export class GroqGateway extends OpenAiCompatibleGateway {
  constructor() {
    super({
      provider: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    });
  }
}

@Injectable()
export class OpenRouterGateway extends OpenAiCompatibleGateway {
  constructor() {
    super({
      provider: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL ?? 'google/gemma-3-27b-it:free',
      headers: {
        'HTTP-Referer': process.env.WEB_ORIGIN ?? 'http://localhost:3000',
        'X-OpenRouter-Title': 'FinoraOS',
      },
    });
  }
}
