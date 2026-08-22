import { Module } from '@nestjs/common';
import { AI_GATEWAY } from './ai.gateway.js';
import { MockAiGateway } from './mock-ai.gateway.js';
import { OllamaGateway } from './ollama.gateway.js';
@Module({
  providers: [
    MockAiGateway,
    OllamaGateway,
    {
      provide: AI_GATEWAY,
      useFactory: (mock: MockAiGateway, ollama: OllamaGateway) =>
        process.env.AI_PROVIDER === 'ollama' ? ollama : mock,
      inject: [MockAiGateway, OllamaGateway],
    },
  ],
  exports: [AI_GATEWAY],
})
export class AiGatewayModule {}
