import { Injectable } from '@nestjs/common';
import type { AiGateway, AiPrompt } from './ai.gateway.js';
@Injectable()
export class OllamaGateway implements AiGateway {
  async complete(input: AiPrompt) {
    const response = await fetch(
      `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/api/chat`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.AI_MODEL,
          stream: false,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.prompt },
          ],
        }),
      },
    );
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    return ((await response.json()) as { message: { content: string } }).message.content;
  }
}
