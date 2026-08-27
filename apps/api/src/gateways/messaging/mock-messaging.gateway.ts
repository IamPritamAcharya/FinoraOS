import { createHash } from 'node:crypto';
import type { DirectMessageInput, MessagingGateway } from './messaging.gateway.js';

export class MockMessagingGateway implements MessagingGateway {
  async sendDirectMessage(input: DirectMessageInput) {
    const id = createHash('sha256')
      .update(`${input.externalUserId}:${input.metadata.receiptRequestId}:${input.text}`)
      .digest('hex')
      .slice(0, 16);
    return {
      provider: 'mock' as const,
      channelId: `mock-dm-${input.externalUserId}`,
      messageId: `mock-message-${id}`,
    };
  }
}
