import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { ChatService } from './chat.service.js';
import { AuthService } from '../auth/auth.service.js';

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
  threadId: z.string().min(1).max(128).optional(),
  writeMode: z.boolean().default(false),
});

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly auth: AuthService,
  ) {}
  @Post() async send(@Body() body: unknown) {
    const { message, context, threadId, writeMode } = ChatRequestSchema.parse(body);
    return this.chat.respond(this.auth.currentPrincipal(), message, context, threadId, writeMode);
  }

  @Get('threads') threads() {
    return this.chat.listThreads(this.auth.currentPrincipal());
  }

  @Get('threads/:id') thread(@Param('id') id: string) {
    return this.chat.thread(this.auth.currentPrincipal(), id);
  }
}
