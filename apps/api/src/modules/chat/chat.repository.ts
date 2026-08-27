import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RequestPrincipal } from '@finora/platform';
import { PrismaService } from '../../prisma/prisma.service.js';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateThread(
    principal: RequestPrincipal,
    input: { threadId?: string; firstMessage: string },
  ) {
    if (input.threadId) {
      const existing = await this.prisma.chatThread.findFirst({
        where: {
          id: input.threadId,
          organizationId: principal.organizationId,
          userId: principal.userId,
        },
      });
      if (existing) return existing;
    }
    return this.prisma.chatThread.create({
      data: {
        ...(input.threadId ? { id: input.threadId } : {}),
        organizationId: principal.organizationId,
        userId: principal.userId,
        title: input.firstMessage.trim().slice(0, 72) || 'New conversation',
      },
    });
  }

  async context(principal: RequestPrincipal, threadId: string) {
    const thread = await this.prisma.chatThread.findFirst({
      where: {
        id: threadId,
        organizationId: principal.organizationId,
        userId: principal.userId,
      },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 24 } },
    });
    return (thread?.messages ?? [])
      .reverse()
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        text: message.content,
      }));
  }

  async saveExchange(input: {
    principal: RequestPrincipal;
    threadId: string;
    userText: string;
    assistantText: string;
    payload: unknown;
    activity: Array<{ callId: string; tool: string; status: string; label: string }>;
    skillId?: string;
    gateway?: { provider: string; model: string; fallbackFrom?: string };
  }) {
    return this.prisma.$transaction(async (tx) => {
      const userMessage = await tx.chatMessage.create({
        data: { threadId: input.threadId, role: 'user', content: input.userText },
      });
      const agentRun = await tx.agentRun.create({
        data: {
          organizationId: input.principal.organizationId,
          agentType: 'CONTROLLER',
          status: 'COMPLETED',
          input: {
            threadId: input.threadId,
            messageId: userMessage.id,
            gateway: input.gateway,
          },
          output: json(input.payload),
          completedAt: new Date(),
          skillId: input.skillId,
          steps: {
            create: input.activity.map((item) => ({
              label: item.label,
              payload: json({ callId: item.callId, tool: item.tool, status: item.status }),
            })),
          },
        },
      });
      const assistantMessage = await tx.chatMessage.create({
        data: {
          threadId: input.threadId,
          role: 'assistant',
          content: input.assistantText,
          payload: json({ ...((input.payload as object) ?? {}), agentRunId: agentRun.id }),
        },
      });
      await tx.chatThread.update({
        where: { id: input.threadId },
        data: { updatedAt: new Date() },
      });
      return { userMessage, assistantMessage, agentRun };
    });
  }

  listThreads(principal: RequestPrincipal) {
    return this.prisma.chatThread.findMany({
      where: { organizationId: principal.organizationId, userId: principal.userId },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  thread(principal: RequestPrincipal, threadId: string) {
    return this.prisma.chatThread.findFirst({
      where: {
        id: threadId,
        organizationId: principal.organizationId,
        userId: principal.userId,
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }
}
