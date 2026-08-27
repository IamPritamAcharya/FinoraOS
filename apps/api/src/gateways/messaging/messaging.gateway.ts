export const MESSAGING_GATEWAY = Symbol('MESSAGING_GATEWAY');

export type DirectMessageInput = {
  externalUserId: string;
  text: string;
  metadata: Record<string, string>;
};

export type DirectMessageResult = {
  provider: 'mock' | 'slack';
  channelId: string;
  messageId: string;
};

export interface MessagingGateway {
  sendDirectMessage(input: DirectMessageInput): Promise<DirectMessageResult>;
}
