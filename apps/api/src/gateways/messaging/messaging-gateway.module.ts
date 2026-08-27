import { Module } from '@nestjs/common';
import { MESSAGING_GATEWAY } from './messaging.gateway.js';
import { MockMessagingGateway } from './mock-messaging.gateway.js';
import { SlackGateway } from './slack.gateway.js';

@Module({
  providers: [
    {
      provide: MESSAGING_GATEWAY,
      useFactory: () => {
        const provider = process.env.MESSAGING_PROVIDER ?? 'mock';
        if (provider === 'slack') {
          if (!process.env.SLACK_BOT_TOKEN) {
            throw new Error('SLACK_BOT_TOKEN is required when MESSAGING_PROVIDER=slack.');
          }
          return new SlackGateway(process.env.SLACK_BOT_TOKEN);
        }
        return new MockMessagingGateway();
      },
    },
  ],
  exports: [MESSAGING_GATEWAY],
})
export class MessagingGatewayModule {}
