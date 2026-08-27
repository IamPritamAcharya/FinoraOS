import type { DirectMessageInput, MessagingGateway } from './messaging.gateway.js';

type SlackResponse = { ok: boolean; channel?: string; ts?: string; error?: string };

export class SlackGateway implements MessagingGateway {
  constructor(private readonly token: string) {}

  async sendDirectMessage(input: DirectMessageInput) {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: input.externalUserId,
        text: input.text,
        metadata: { event_type: 'finora_receipt_request', event_payload: input.metadata },
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const result = (await response.json()) as SlackResponse;
    if (!response.ok || !result.ok || !result.channel || !result.ts) {
      throw new Error(`Slack rejected the receipt reminder: ${result.error ?? response.status}`);
    }
    return { provider: 'slack' as const, channelId: result.channel, messageId: result.ts };
  }
}
