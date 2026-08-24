import type { AiProvider } from './provider-selection.js';

export type AiPrompt = { system: string; prompt: string };
export type AiCompletion = {
  text: string;
  provider: AiProvider;
  model: string;
  fallbackFrom?: AiProvider;
};
export interface AiGateway {
  complete(input: AiPrompt): Promise<AiCompletion>;
}
export const AI_GATEWAY = Symbol('AI_GATEWAY');
