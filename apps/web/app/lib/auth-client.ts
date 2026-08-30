'use client';

import { signOut } from 'next-auth/react';

/** Clears a stale local session without ending the provider session. */
export async function clearExpiredFinoraSession() {
  await signOut({ redirect: false });
}

export async function logoutFromFinora() {
  let providerLogoutUrl = '/login';
  try {
    const response = await fetch('/api/auth/keycloak-logout', {
      method: 'POST',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (response.ok) {
      const body = (await response.json()) as { url?: string };
      if (body.url) providerLogoutUrl = body.url;
    }
  } catch {
    // Clearing the local session still leaves the user safely signed out of FinoraOS.
  } finally {
    await signOut({ redirect: false });
    window.location.assign(providerLogoutUrl);
  }
}
