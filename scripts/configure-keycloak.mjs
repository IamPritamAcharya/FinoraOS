import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(resolve(rootDirectory, '.env'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const issuer = new URL(process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/finora');
const keycloakBaseUrl = issuer.origin;
const realm = issuer.pathname.split('/').filter(Boolean).at(-1) ?? 'finora';
const adminUsername = process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin';
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'finora_admin_dev';
const clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'finora-web';
const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
const sleep = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function adminToken() {
  const response = await fetch(`${keycloakBaseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'admin-cli',
      grant_type: 'password',
      username: adminUsername,
      password: adminPassword,
    }),
  });
  if (!response.ok) throw new Error(`Keycloak admin login returned HTTP ${response.status}.`);
  const body = await response.json();
  if (!body.access_token) throw new Error('Keycloak admin login returned no access token.');
  return body.access_token;
}

async function waitForKeycloak() {
  let lastError;
  for (let attempt = 1; attempt <= 45; attempt += 1) {
    try {
      return await adminToken();
    } catch (error) {
      lastError = error;
      await sleep(2_000);
    }
  }
  throw lastError ?? new Error('Keycloak did not become ready.');
}

async function keycloakRequest(path, token, init = {}) {
  const response = await fetch(`${keycloakBaseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Keycloak configuration returned HTTP ${response.status}.`);
  if (response.status === 204) return undefined;
  return response.json();
}

async function main() {
  const token = await waitForKeycloak();
  await keycloakRequest(`/admin/realms/${encodeURIComponent(realm)}`, token, {
    method: 'PUT',
    body: JSON.stringify({
      loginTheme: 'finora',
      accessTokenLifespan: 300,
      ssoSessionIdleTimeout: 1_800,
      ssoSessionMaxLifespan: 28_800,
      clientSessionIdleTimeout: 1_800,
      clientSessionMaxLifespan: 28_800,
    }),
  });
  const clients = await keycloakRequest(
    `/admin/realms/${encodeURIComponent(realm)}/clients?clientId=${encodeURIComponent(clientId)}`,
    token,
  );
  const client = Array.isArray(clients) ? clients[0] : undefined;
  if (!client?.id) throw new Error(`Keycloak client ${clientId} was not found.`);
  await keycloakRequest(
    `/admin/realms/${encodeURIComponent(realm)}/clients/${encodeURIComponent(client.id)}`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify({
        ...client,
        attributes: {
          ...(client.attributes ?? {}),
          'post.logout.redirect.uris': `${appUrl}/login`,
        },
      }),
    },
  );
  const configuredRealm = await keycloakRequest(
    `/admin/realms/${encodeURIComponent(realm)}`,
    token,
  );
  const configuredClients = await keycloakRequest(
    `/admin/realms/${encodeURIComponent(realm)}/clients?clientId=${encodeURIComponent(clientId)}`,
    token,
  );
  const configuredClient = Array.isArray(configuredClients) ? configuredClients[0] : undefined;
  if (
    configuredRealm.loginTheme !== 'finora' ||
    configuredRealm.accessTokenLifespan !== 300 ||
    configuredRealm.ssoSessionIdleTimeout !== 1_800 ||
    configuredRealm.ssoSessionMaxLifespan !== 28_800 ||
    configuredClient?.attributes?.['post.logout.redirect.uris'] !== `${appUrl}/login`
  ) {
    throw new Error('Keycloak did not retain the required FinoraOS session configuration.');
  }
  console.log(
    'Configured FinoraOS Keycloak theme, coordinated logout, 5-minute access tokens, 30-minute idle timeout, and 8-hour maximum session.',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
