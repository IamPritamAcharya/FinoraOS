export const aiProviders = ['mock', 'ollama', 'gemini', 'groq', 'openrouter'] as const;
export type AiProvider = (typeof aiProviders)[number];
export type RequestedAiProvider = AiProvider | 'auto';

export type AiEnvironment = {
  AI_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
};

export type AiProviderSelection = {
  primary: AiProvider;
  fallback?: 'ollama';
  requested: RequestedAiProvider;
  reason: string;
};

const hasValue = (value: string | undefined) => Boolean(value?.trim());

const requestedProvider = (value: string | undefined): RequestedAiProvider => {
  const normalized = value?.trim().toLowerCase();
  return normalized && [...aiProviders, 'auto'].includes(normalized as RequestedAiProvider)
    ? (normalized as RequestedAiProvider)
    : 'auto';
};

const localFallback = (requested: RequestedAiProvider, reason: string): AiProviderSelection => ({
  primary: 'ollama',
  requested,
  reason,
});

export const selectAiProvider = (environment: AiEnvironment): AiProviderSelection => {
  const requested = requestedProvider(environment.AI_PROVIDER);
  if (requested === 'mock') {
    return { primary: 'mock', requested, reason: 'Mock provider was explicitly requested.' };
  }
  if (requested === 'ollama') {
    return localFallback(requested, 'Local Ollama provider was explicitly requested.');
  }

  const hosted = [
    ['gemini', hasValue(environment.GEMINI_API_KEY), 'GEMINI_API_KEY'] as const,
    ['groq', hasValue(environment.GROQ_API_KEY), 'GROQ_API_KEY'] as const,
    ['openrouter', hasValue(environment.OPENROUTER_API_KEY), 'OPENROUTER_API_KEY'] as const,
  ];

  if (requested !== 'auto') {
    const requestedConfig = hosted.find(([provider]) => provider === requested);
    if (requestedConfig?.[1]) {
      return {
        primary: requested,
        fallback: 'ollama',
        requested,
        reason: `${requestedConfig[2]} is configured.`,
      };
    }
    return localFallback(
      requested,
      `${requested.toUpperCase()} API key is absent; using local Ollama.`,
    );
  }

  const configured = hosted.find(([, available]) => available);
  if (configured) {
    return {
      primary: configured[0],
      fallback: 'ollama',
      requested,
      reason: `${configured[2]} is configured.`,
    };
  }
  return localFallback(requested, 'No hosted AI API key is configured; using local Ollama.');
};
