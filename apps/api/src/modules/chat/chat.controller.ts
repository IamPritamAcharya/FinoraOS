import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { ChatService } from './chat.service.js';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  context: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().min(1).max(1000),
      }),
    )
    .max(12)
    .default([]),
});

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}
  @Post() async send(@Body() body: unknown) {
    const { message, context } = ChatRequestSchema.parse(body);
    return this.chat.respond(message, context);
  }
}
