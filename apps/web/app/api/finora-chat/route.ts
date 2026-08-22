import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type IncomingMessage = {
  role?: string;
  parts?: Array<{ type?: string; text?: string }>;
};

const textResponse = (text: string, status = 200) =>
  new Response(text, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

export async function POST(request: NextRequest) {
  let payload: { messages?: IncomingMessage[] };
  try {
    payload = await request.json();
  } catch {
    return textResponse('Unable to read this conversation request.', 400);
  }
  const latestUserMessage = [...(payload.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'user');
  const message = latestUserMessage?.parts
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!message) return textResponse('Ask Finora a finance operations question to begin.', 400);

  const api =
    process.env.FINORA_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
  try {
    const response = await fetch(`${api}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
      cache: 'no-store',
    });
    if (!response.ok)
      return textResponse(
        'Finora is temporarily unavailable. Check the API connection and try again.',
        502,
      );
    const result = (await response.json()) as { text?: string; aiExplanation?: string };
    const text = [result.text, result.aiExplanation].filter(Boolean).join('\n\n');
    return textResponse(text || 'Finora returned no explanation for this request.');
  } catch {
    return textResponse('Finora is offline. Start the API and database, then try again.', 502);
  }
}
