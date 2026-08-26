'use client';

import { usePathname, useRouter } from 'next/navigation';
import { AppSidebar, type WorkspaceView } from './app-sidebar';
import styles from '../workspace.module.css';

const viewForPath = (pathname: string): WorkspaceView => {
  if (pathname === '/') return 'Chat';
  const value = pathname.slice(1);
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}` as WorkspaceView;
};

const pathForView = (view: WorkspaceView) => (view === 'Chat' ? '/' : `/${view.toLowerCase()}`);

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeView = viewForPath(pathname);
  return (
    <main className={styles.shell}>
      <AppSidebar activeView={activeView} onNavigate={(view) => router.push(pathForView(view))} />
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
