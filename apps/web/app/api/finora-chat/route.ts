import { NextRequest } from 'next/server';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai';
import { FinoraChatPayloadSchema, type FinoraChatPayload } from '@finora/platform';
import { authorizationHeaders } from '../../lib/server-auth';

export const dynamic = 'force-dynamic';

type FinoraUIMessage = UIMessage<unknown, { finora: FinoraChatPayload }>;
type IncomingMessage = {
  role?: string;
  parts?: Array<{ type?: string; text?: string }>;
};

const messageText = (message: IncomingMessage) =>
  message.parts
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('')
    .trim() ?? '';

export async function POST(request: NextRequest) {
  let payload: { messages?: IncomingMessage[]; threadId?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Unable to read this conversation request.' }, { status: 400 });
  }
  const latestUserMessage = [...(payload.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'user');
  const message = latestUserMessage ? messageText(latestUserMessage) : '';
  if (!message)
    return Response.json(
      { error: 'Ask Finora a finance operations question to begin.' },
      { status: 400 },
    );

  const api =
    process.env.FINORA_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
  const stream = createUIMessageStream<FinoraUIMessage>({
    execute: async ({ writer }) => {
      const authHeaders = await authorizationHeaders(request);
      const response = await fetch(`${api}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          message,
          threadId: payload.threadId,
          context: (payload.messages ?? [])
            .slice(-12)
            .filter(
              (item): item is IncomingMessage & { role: 'user' | 'assistant' } =>
                item.role === 'user' || item.role === 'assistant',
            )
            .map((item) => ({ role: item.role, text: messageText(item) }))
            .filter((item) => item.text.length > 0),
        }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Finora API request failed.');
      const result = FinoraChatPayloadSchema.parse(await response.json());
      writer.write({ type: 'data-finora', data: result });
      const textId = result.messageId;
      writer.write({ type: 'text-start', id: textId });
      writer.write({ type: 'text-delta', id: textId, delta: result.text });
      writer.write({ type: 'text-end', id: textId });
    },
    onError: () => 'Finora could not complete this request. Check the API and try again.',
  });
  return createUIMessageStreamResponse({ stream });
}
