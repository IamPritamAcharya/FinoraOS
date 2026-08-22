import { Inject, Injectable } from '@nestjs/common';
import { AI_GATEWAY, type AiGateway } from '../../gateways/ai/ai.gateway.js';
import { FinanceService } from '../finance/finance.service.js';
@Injectable()
export class ChatService {
  constructor(
    @Inject(AI_GATEWAY) private readonly ai: AiGateway,
    private readonly finance: FinanceService,
  ) {}
  async respond(message: string) {
    const settlements = await this.finance.settlements();
    const found = settlements.find((item) =>
      message.toLowerCase().includes(item.externalId.toLowerCase()),
    );
    if (found) {
      const difference = Number(found.expectedAmount) - Number(found.receivedAmount);
      return {
        kind: 'settlement',
        text: await this.ai.complete({
          system:
            'Give concise, evidence-grounded finance explanations. Never invent calculations.',
          prompt: `Explain settlement ${found.externalId}. Expected ${found.expectedAmount}; received ${found.receivedAmount}; fees ${found.feeAmount}; GST ${found.gstAmount}; refunds ${found.refundAmount}; deterministic difference ${difference}.`,
        }),
        settlement: found,
      };
    }
    return {
      kind: 'general',
      text: 'I can investigate a settlement ID, show unresolved exceptions, or explain the seven-day cash forecast. I only use controlled finance data and never change records from chat.',
    };
  }
}
