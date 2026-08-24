import { describe, expect, it } from 'vitest';
import { selectAiProvider } from './provider-selection.js';

describe('selectAiProvider', () => {
  it('uses Gemini when auto mode finds a Gemini key', () => {
    expect(selectAiProvider({ AI_PROVIDER: 'auto', GEMINI_API_KEY: 'key' })).toEqual({
      primary: 'gemini',
      fallback: 'ollama',
      requested: 'auto',
      reason: 'GEMINI_API_KEY is configured.',
    });
  });

  it('uses the documented hosted-key precedence in auto mode', () => {
    expect(
      selectAiProvider({
        GROQ_API_KEY: 'groq-key',
        OPENROUTER_API_KEY: 'openrouter-key',
      }),
    ).toMatchObject({ primary: 'groq', fallback: 'ollama', requested: 'auto' });
  });

  it('falls back to local Ollama when no hosted key exists', () => {
    expect(selectAiProvider({ AI_PROVIDER: 'auto' })).toMatchObject({
      primary: 'ollama',
      requested: 'auto',
    });
  });

  it('falls back to Ollama when a specifically requested provider has no key', () => {
    expect(selectAiProvider({ AI_PROVIDER: 'openrouter' })).toMatchObject({
      primary: 'ollama',
      requested: 'openrouter',
    });
  });

  it('allows mock only when explicitly selected', () => {
    expect(selectAiProvider({ AI_PROVIDER: 'mock', GEMINI_API_KEY: 'key' })).toMatchObject({
      primary: 'mock',
      requested: 'mock',
    });
  });
});
