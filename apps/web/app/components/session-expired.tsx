'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { FinoraButton, FinoraMark } from '@finora/ui';
import styles from './session-expired.module.css';

export function SessionExpired({ callbackUrl }: { callbackUrl: string }) {
  const [signingIn, setSigningIn] = useState(false);

  const signInAgain = async () => {
    setSigningIn(true);
    await signIn('keycloak', { callbackUrl });
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="session-expired-title">
        <div className={styles.brand}>
          <FinoraMark />
          <span>FinoraOS</span>
        </div>
        <span className={styles.status}>Session expired</span>
        <h1 id="session-expired-title">Sign in to continue</h1>
        <p>
          Your workspace session has ended to protect financial data. Sign in again to return to
          your work.
        </p>
        <FinoraButton
          className={styles.action}
          onClick={() => void signInAgain()}
          disabled={signingIn}
        >
          {signingIn ? 'Opening enterprise login…' : 'Sign in again'}
        </FinoraButton>
        <small>Your previous workspace changes were saved before the session ended.</small>
      </section>
    </main>
  );
}
