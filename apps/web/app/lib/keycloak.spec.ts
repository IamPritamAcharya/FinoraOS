import { describe, expect, it } from 'vitest';
import { buildKeycloakLogoutUrl } from './keycloak';

describe('buildKeycloakLogoutUrl', () => {
  it('creates an RP-initiated logout request with the ID token hint', () => {
    const result = new URL(
      buildKeycloakLogoutUrl({
        issuer: 'http://localhost:8080/realms/finora',
        clientId: 'finora-web',
        appUrl: 'http://localhost:3000',
        idToken: 'signed-id-token',
      }),
    );

    expect(result.pathname).toBe('/realms/finora/protocol/openid-connect/logout');
    expect(result.searchParams.get('client_id')).toBe('finora-web');
    expect(result.searchParams.get('id_token_hint')).toBe('signed-id-token');
    expect(result.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:3000/login');
  });
});
