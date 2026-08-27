import type { NextRequest } from 'next/server';
import { authorizationHeaders } from '../../../../lib/server-auth';

const api = () =>
  process.env.FINORA_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetch(`${api()}/chat/threads/${encodeURIComponent(id)}`, {
    headers: await authorizationHeaders(request),
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok || !text.trim()) {
    return Response.json(
      { error: 'Unable to load this conversation.' },
      { status: response.ok ? 404 : response.status },
    );
  }
  return new Response(text, { headers: { 'content-type': 'application/json' } });
}
