import type { NextRequest } from 'next/server';
import { authorizationHeaders } from '../../../lib/server-auth';

const api = () =>
  process.env.FINORA_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function GET(request: NextRequest) {
  const response = await fetch(`${api()}/chat/threads`, {
    headers: await authorizationHeaders(request),
    cache: 'no-store',
  });
  if (!response.ok) {
    return Response.json({ error: 'Unable to load conversations.' }, { status: response.status });
  }
  return Response.json(await response.json());
}
