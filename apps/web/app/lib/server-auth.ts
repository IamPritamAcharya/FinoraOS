import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function authorizationHeaders(request: NextRequest): Promise<Record<string, string>> {
  if (process.env.NEXT_PUBLIC_AUTH_MODE !== 'keycloak') return {};
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  return token?.accessToken ? { authorization: `Bearer ${token.accessToken}` } : {};
}
