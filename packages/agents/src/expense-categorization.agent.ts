import { z } from 'zod';

const categoryValues = [
  'TRAVEL',
  'MEALS',
  'LODGING',
  'LOCAL_TRANSPORT',
  'SOFTWARE',
  'OFFICE_SUPPLIES',
  'MARKETING',
  'PROFESSIONAL_SERVICES',
  'UTILITIES',
  'VENDOR_PAYMENT',
  'OTHER',
] as const;

export const ExpenseCategorizationSchema = z.object({
  category: z.enum(categoryValues),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(240),
});

export type ExpenseCategorization = z.infer<typeof ExpenseCategorizationSchema>;

export interface CategorizationModel {
  complete(input: {
    system: string;
    prompt: string;
    responseFormat?: 'json';
  }): Promise<{ text: string; provider: string; model: string }>;
}

export class ExpenseCategorizationAgent {
  constructor(private readonly model: CategorizationModel) {}

  async categorize(input: { merchant: string; description: string; fileName?: string }) {
    const completion = await this.model.complete({
      system:
        'You classify business expenses. Return JSON only. Never infer an amount. Allowed categories: TRAVEL, MEALS, LODGING, LOCAL_TRANSPORT, SOFTWARE, OFFICE_SUPPLIES, MARKETING, PROFESSIONAL_SERVICES, UTILITIES, VENDOR_PAYMENT, OTHER.',
      prompt: JSON.stringify(input),
      responseFormat: 'json',
    });
    const result = ExpenseCategorizationSchema.parse(JSON.parse(completion.text));
    return { ...result, provider: completion.provider, model: completion.model };
  }
}
