'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { AppSidebar, type WorkspaceView } from './app-sidebar';
import styles from '../workspace.module.css';
import { logoutFromFinora } from '../lib/auth-client';

const viewForPath = (pathname: string): WorkspaceView => {
  if (pathname === '/') return 'Chat';
  const value = pathname.slice(1);
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}` as WorkspaceView;
};

const pathForView = (view: WorkspaceView) => (view === 'Chat' ? '/' : `/${view.toLowerCase()}`);

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const keycloakEnabled = process.env.NEXT_PUBLIC_AUTH_MODE === 'keycloak';
  const activeView = viewForPath(pathname);
  useEffect(() => {
    if (keycloakEnabled && status === 'unauthenticated' && pathname !== '/login') {
      router.replace('/login');
    }
  }, [keycloakEnabled, pathname, router, status]);
  useEffect(() => {
    if (keycloakEnabled && session?.error === 'RefreshAccessTokenError') {
      void logoutFromFinora();
    }
  }, [keycloakEnabled, session?.error]);
  if (pathname === '/login') return children;
  if (keycloakEnabled && status !== 'authenticated') {
    return <main className={styles.authLoading}>Securing your FinoraOS workspace…</main>;
  }
  return (
    <main className={styles.shell}>
      <AppSidebar
        activeView={activeView}
        onNavigate={(view) => router.push(pathForView(view))}
        account={
          session?.user
            ? {
                name: session.user.name ?? session.user.email ?? 'FinoraOS user',
                detail: (session.user.role ?? 'Workspace member').replaceAll('_', ' '),
                role: session.user.role,
              }
            : undefined
        }
        onSignOut={keycloakEnabled ? () => void logoutFromFinora() : undefined}
      />
      <section
        className={
          activeView === 'Chat' ? `${styles.content} ${styles.contentChat}` : styles.content
        }
      >
        {children}
      </section>
    </main>
  );
}
