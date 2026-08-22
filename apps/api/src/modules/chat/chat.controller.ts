import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { ChatService } from './chat.service.js';
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}
  @Post() async send(@Body() body: unknown) {
    const { message } = z.object({ message: z.string().min(1).max(1000) }).parse(body);
    return this.chat.respond(message);
  }
}
