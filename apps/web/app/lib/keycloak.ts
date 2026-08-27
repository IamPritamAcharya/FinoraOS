export function buildKeycloakLogoutUrl({
  issuer,
  clientId,
  appUrl,
  idToken,
}: {
  issuer: string;
  clientId: string;
  appUrl: string;
  idToken?: string;
}) {
  const logoutUrl = new URL(`${issuer.replace(/\/$/, '')}/protocol/openid-connect/logout`);
  logoutUrl.searchParams.set('client_id', clientId);
  logoutUrl.searchParams.set('post_logout_redirect_uri', new URL('/login', appUrl).toString());
  if (idToken) logoutUrl.searchParams.set('id_token_hint', idToken);
  return logoutUrl.toString();
}
