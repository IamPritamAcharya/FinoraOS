import { describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service.js';

const principal = { organizationId: 'demo-org', userId: 'demo-user' };

describe('ChatService', () => {
  it('runs a multi-step tool conversation and persists the structured result', async () => {
    const ai = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          text: JSON.stringify({ type: 'tool', call: { tool: 'getCurrentUser', arguments: {} } }),
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            type: 'answer',
            answer: 'Your email is finance@finora.local.',
            citations: ['call-1'],
          }),
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
    const tools = { forPrincipal: vi.fn().mockReturnValue({ execute }) };
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
