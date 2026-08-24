import { Injectable } from '@nestjs/common';
import { apiLogger } from '../../common/api-logger.js';
import type { AiGateway, AiPrompt } from './ai.gateway.js';

type GeminiResponse = {
  output_text?: string;
  steps?: Array<{ content?: Array<{ text?: string }> }>;
};

const extractText = (response: GeminiResponse) => {
  if (response.output_text?.trim()) return response.output_text;
  return response.steps
    ?.flatMap((step) => step.content ?? [])
    .map((part) => part.text ?? '')
    .filter(Boolean)
    .join('');
};

@Injectable()
export class GeminiGateway implements AiGateway {
  async complete(input: AiPrompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required for Gemini.');
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    const startedAt = performance.now();
    apiLogger.info('AI completion started', { provider: 'gemini', model });
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model,
        store: false,
        system_instruction: input.system,
        input: input.prompt,
        generation_config: { temperature: 0.2 },
      }),
    });
    if (!response.ok) {
      apiLogger.warn('AI completion failed', {
        provider: 'gemini',
        model,
        statusCode: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw new Error(`Gemini returned ${response.status}`);
    }
    const text = extractText((await response.json()) as GeminiResponse);
    if (!text?.trim()) throw new Error('Gemini returned an empty completion.');
    apiLogger.info('AI completion completed', {
      provider: 'gemini',
      model,
      durationMs: Math.round(performance.now() - startedAt),
      responseLength: text.length,
    });
    return { text, provider: 'gemini' as const, model };
  }
}
