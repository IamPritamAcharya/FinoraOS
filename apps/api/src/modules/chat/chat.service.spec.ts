import { describe, expect, it, vi } from 'vitest';
import {
  ChatService,
  shouldResumePendingWrite,
  shouldUseConversationContext,
} from './chat.service.js';

const principal = { organizationId: 'demo-org', userId: 'demo-user' };

describe('ChatService', () => {
  it('uses context only for genuine follow-ups, not explicit topic changes', () => {
    expect(shouldUseConversationContext('everything')).toBe(true);
    expect(shouldUseConversationContext('tell me more about that')).toBe(true);
    expect(shouldUseConversationContext('whats pay_00008')).toBe(false);
    expect(shouldUseConversationContext('Summarise our expenses this month')).toBe(false);
    expect(shouldUseConversationContext('what is our monthly operating budget')).toBe(false);
  });

  it('retains an active write clarification when the user supplies the missing reference', () => {
    const context = [
      { role: 'user' as const, text: 'Change the payment status to refunded.' },
      { role: 'assistant' as const, text: 'What is the exact pay_##### reference?' },
    ];
    expect(shouldUseConversationContext('pay_00008')).toBe(false);
    expect(shouldResumePendingWrite(context, true)).toBe(true);
    expect(shouldResumePendingWrite(context, false)).toBe(false);
    expect(
      shouldResumePendingWrite(
        [
          { role: 'user', text: 'Tell me about payments.' },
          { role: 'assistant', text: 'Which period?' },
        ],
        true,
      ),
    ).toBe(false);
  });

  it('runs a multi-step tool conversation and persists the structured result', async () => {
    const ai = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          text: JSON.stringify({ type: 'tool', call: { tool: 'getCurrentUser', arguments: {} } }),
          provider: 'mock' as const,
          model: 'deterministic-mock',
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            type: 'answer',
            answer: 'Your email is finance@finora.local.',
            citations: ['call-1'],
          }),
          provider: 'mock' as const,
          model: 'deterministic-mock',
        }),
    };
    const execute = vi.fn().mockResolvedValue({
      callId: 'call-1',
      tool: 'getCurrentUser',
      summary: 'You are signed in as Aarav Mehta. Your email is finance@finora.local.',
      data: { name: 'Aarav Mehta', email: 'finance@finora.local' },
      artifact: {
        type: 'profile',
        title: 'Your profile',
        data: { name: 'Aarav Mehta', email: 'finance@finora.local' },
      },
    });
    const tools = {
      forPrincipal: vi.fn().mockReturnValue({ execute }),
      activeSkills: vi.fn().mockResolvedValue([]),
    };
    const chats = {
      getOrCreateThread: vi.fn().mockResolvedValue({ id: 'thread-1' }),
      context: vi.fn().mockResolvedValue([]),
      saveExchange: vi.fn().mockResolvedValue({
        assistantMessage: { id: 'message-2' },
        agentRun: { id: 'agent-run-1' },
      }),
    };
    const result = await new ChatService(ai, tools as never, chats as never).respond(
      principal,
      'What is my email?',
      [],
      'thread-1',
    );
    expect(execute).toHaveBeenCalledOnce();
    expect(chats.saveExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        principal,
        threadId: 'thread-1',
        assistantText: 'Your email is finance@finora.local.',
      }),
    );
    expect(result).toMatchObject({
      threadId: 'thread-1',
      messageId: 'message-2',
      text: 'Your email is finance@finora.local.',
    });
    expect(result.artifacts).toHaveLength(1);
  });
});
