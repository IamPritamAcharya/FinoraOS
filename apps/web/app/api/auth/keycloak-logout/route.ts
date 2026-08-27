import { getToken } from 'next-auth/jwt';
import { type NextRequest, NextResponse } from 'next/server';
import { buildKeycloakLogoutUrl } from '../../../lib/keycloak';

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const issuer = process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/finora';
  const clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'finora-web';
  const appUrl = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
  const logoutUrl = buildKeycloakLogoutUrl({
    issuer,
    clientId,
    appUrl,
    idToken: token?.idToken,
  });
  return NextResponse.json({ url: logoutUrl }, { headers: { 'cache-control': 'no-store' } });
}
