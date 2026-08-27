'use client';

import { getSession } from 'next-auth/react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function finoraRequest(path: string, init?: RequestInit) {
  const session = process.env.NEXT_PUBLIC_AUTH_MODE === 'keycloak' ? await getSession() : undefined;
  const hasFormBody = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      ...(hasFormBody ? {} : { 'content-type': 'application/json' }),
      ...(session?.accessToken ? { authorization: `Bearer ${session.accessToken}` } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    throw new Error(
      Array.isArray(body.message)
        ? body.message.join(', ')
        : (body.message ?? 'FinoraOS API is unavailable.'),
    );
  }
  return response.json() as Promise<unknown>;
}
