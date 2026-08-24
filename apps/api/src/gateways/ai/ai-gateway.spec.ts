import { afterEach, describe, expect, it, vi } from 'vitest';
import { FallbackAiGateway } from './fallback-ai.gateway.js';
import { GeminiGateway } from './gemini.gateway.js';
import { GroqGateway } from './openai-compatible.gateway.js';

const prompt = { system: 'System instruction', prompt: 'Controlled prompt' };
const originalEnvironment = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnvironment };
});

describe('AI gateways', () => {
  it('uses the Gemini interactions endpoint with a system instruction', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    process.env.GEMINI_MODEL = 'gemini-test-model';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ output_text: 'Documented adjustments explain the result.' })),
      );
    vi.stubGlobal('fetch', fetchMock);

    const completion = await new GeminiGateway().complete(prompt);

    expect(completion).toMatchObject({ provider: 'gemini', model: 'gemini-test-model' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-test-key' }),
      }),
    );
  });

  it('uses the Groq OpenAI-compatible chat completions endpoint', async () => {
    process.env.GROQ_API_KEY = 'groq-test-key';
    process.env.GROQ_MODEL = 'groq-test-model';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Documented adjustments explain it.' } }],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const completion = await new GroqGateway().complete(prompt);

    expect(completion).toMatchObject({ provider: 'groq', model: 'groq-test-model' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer groq-test-key' }),
      }),
    );
  });

  it('retries through Ollama when a hosted completion fails', async () => {
    const primary = { complete: vi.fn().mockRejectedValue(new Error('provider unavailable')) };
    const fallback = {
      complete: vi.fn().mockResolvedValue({
        text: 'Local explanation.',
        provider: 'ollama' as const,
        model: 'qwen3:4b-instruct-2507-q4_K_M',
      }),
    };

    const completion = await new FallbackAiGateway(primary, fallback, 'gemini').complete(prompt);

    expect(fallback.complete).toHaveBeenCalledWith(prompt);
    expect(completion).toMatchObject({ provider: 'ollama', fallbackFrom: 'gemini' });
  });
});
