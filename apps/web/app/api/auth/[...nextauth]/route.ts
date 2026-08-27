import NextAuth, { type NextAuthOptions } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';

const workspaceRoles = [
  'EMPLOYEE',
  'FINANCE_OPERATOR',
  'FINANCE_CONTROLLER',
  'ENTERPRISE_ADMIN',
  'AUDITOR',
];

const roleFromAccessToken = (accessToken?: string) => {
  if (!accessToken) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { realm_access?: { roles?: string[] } };
    return payload.realm_access?.roles?.find((role) => workspaceRoles.includes(role));
  } catch {
    return undefined;
  }
};

async function refreshAccessToken(token: {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  role?: string;
}) {
  try {
    const response = await fetch(`${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.KEYCLOAK_CLIENT_ID ?? 'finora-web',
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken ?? '',
      }),
      cache: 'no-store',
    });
    const refreshed = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!response.ok || !refreshed.access_token) throw new Error('Token refresh failed.');
    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + (refreshed.expires_in ?? 300) * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' as const };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'finora-web',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? 'finora-web-dev-secret',
      issuer: process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/finora',
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        const realmAccess = (profile as { realm_access?: { roles?: string[] } } | undefined)
          ?.realm_access;
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: (account.expires_at ?? 0) * 1000,
          role:
            roleFromAccessToken(account.access_token) ??
            realmAccess?.roles?.find((role) => workspaceRoles.includes(role)),
        };
      }
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires - 30_000) return token;
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      if (session.user) session.user.role = token.role;
      return session;
    },
  },
  pages: { signIn: '/login' },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
