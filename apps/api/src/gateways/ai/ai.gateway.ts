export type AiPrompt = { system: string; prompt: string };
export interface AiGateway {
  complete(input: AiPrompt): Promise<string>;
}
export const AI_GATEWAY = Symbol('AI_GATEWAY');
