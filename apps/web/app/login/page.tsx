'use client';

import { signIn } from 'next-auth/react';
import { FinoraButton, FinoraMark } from '@finora/ui';
import styles from './login.module.css';

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.logo}>
          <FinoraMark />
          <span>FinoraOS</span>
        </div>
        <p className={styles.eyebrow}>FINANCE OPERATIONS CONTROL PLANE</p>
        <h1>Sign in to FinoraOS</h1>
        <p className={styles.copy}>
          Access is scoped by your enterprise, workspace role and organization node.
        </p>
        <FinoraButton
          className={styles.signIn}
          onClick={() => void signIn('keycloak', { callbackUrl: '/' })}
        >
          Continue with enterprise login
        </FinoraButton>
        <div className={styles.roles}>
          <span>Employee</span>
          <span>Finance controller</span>
          <span>Enterprise admin</span>
        </div>
      </section>
    </main>
  );
}
