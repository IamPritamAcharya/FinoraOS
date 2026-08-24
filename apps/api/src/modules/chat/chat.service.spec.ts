import { describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service.js';

describe('ChatService', () => {
  it('uses the configured AI gateway for a general conversational question', async () => {
    const ai = {
      complete: vi.fn().mockResolvedValue({
        text: 'I am Finora, your finance operations assistant.',
        provider: 'ollama',
        model: 'qwen3:4b-instruct-2507-q4_K_M',
      }),
    };
    const finance = { settlements: vi.fn().mockResolvedValue([]) };
    const service = new ChatService(ai, finance as never);

    const result = await service.respond('Who are you?');

    expect(ai.complete).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      kind: 'general',
      text: 'I am Finora, your finance operations assistant.',
    });
  });
});
