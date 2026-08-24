import { Module } from '@nestjs/common';
import { apiLogger } from '../../common/api-logger.js';
import { AI_GATEWAY } from './ai.gateway.js';
import { FallbackAiGateway } from './fallback-ai.gateway.js';
import { GeminiGateway } from './gemini.gateway.js';
import { MockAiGateway } from './mock-ai.gateway.js';
import { OllamaGateway } from './ollama.gateway.js';
import { GroqGateway, OpenRouterGateway } from './openai-compatible.gateway.js';
import { selectAiProvider } from './provider-selection.js';
@Module({
  providers: [
    MockAiGateway,
    OllamaGateway,
    GeminiGateway,
    GroqGateway,
    OpenRouterGateway,
    {
      provide: AI_GATEWAY,
      useFactory: (
        mock: MockAiGateway,
        ollama: OllamaGateway,
        gemini: GeminiGateway,
        groq: GroqGateway,
        openRouter: OpenRouterGateway,
      ) => {
        const selection = selectAiProvider({
          AI_PROVIDER: process.env.AI_PROVIDER,
          GEMINI_API_KEY: process.env.GEMINI_API_KEY,
          GROQ_API_KEY: process.env.GROQ_API_KEY,
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        });
        const gateways = { mock, ollama, gemini, groq, openrouter: openRouter };
        const primary = gateways[selection.primary];
        apiLogger.info('AI gateway selected', {
          provider: selection.primary,
          fallbackProvider: selection.fallback,
          requestedProvider: selection.requested,
          reason: selection.reason,
        });
        return selection.fallback
          ? new FallbackAiGateway(primary, ollama, selection.primary)
          : primary;
      },
      inject: [MockAiGateway, OllamaGateway, GeminiGateway, GroqGateway, OpenRouterGateway],
    },
  ],
  exports: [AI_GATEWAY],
})
export class AiGatewayModule {}
