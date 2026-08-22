import type { CSSProperties } from 'react';
import { FinoraButton, FinoraIcon, type FinoraIconName } from '@finora/ui';
import styles from './app-sidebar.module.css';

export const workspaceViews = [
  'Overview',
  'Chat',
  'Records',
  'Reconciliation',
  'Exceptions',
] as const;
export type WorkspaceView = (typeof workspaceViews)[number];

const navigationItems: Array<{ label: string; view: WorkspaceView; icon: FinoraIconName }> = [
  { label: 'Finora', view: 'Chat', icon: 'finora' },
  { label: 'Overview', view: 'Overview', icon: 'overview' },
  { label: 'Records', view: 'Records', icon: 'records' },
  { label: 'Reconciliation', view: 'Reconciliation', icon: 'reconciliation' },
  { label: 'Exceptions', view: 'Exceptions', icon: 'exceptions' },
];

export function AppSidebar({
  activeView,
  onNavigate,
}: {
  activeView: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
}) {
  const activeIndex = navigationItems.findIndex((item) => item.view === activeView);
  const navStyle = { '--active-index': activeIndex } as CSSProperties;

  return (
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/" aria-label="FinoraOS home">
        <img src="/brand/logo-mark.svg" alt="" />
        <span>FinoraOS</span>
      </a>
      <nav className={styles.nav} aria-label="Primary navigation" style={navStyle}>
        <span className={styles.indicator} aria-hidden="true" />
        {navigationItems.map(({ label, view, icon }, index) => (
          <FinoraButton
            key={view}
            type="button"
            variant="ghost"
            size="medium"
            data-index={index}
            aria-current={activeView === view ? 'page' : undefined}
            className={`${styles.navButton} ${activeView === view ? styles.navButtonActive : ''} ${view === 'Chat' ? styles.chatButton : ''}`}
            onClick={() => onNavigate(view)}
          >
            <FinoraIcon className={styles.navIcon} name={icon} />
            <span>{label}</span>
          </FinoraButton>
        ))}
      </nav>
      <FinoraButton
        className={styles.account}
        variant="ghost"
        aria-label="Acme Commerce India account"
      >
        <span className={styles.accountIcon}>
          <FinoraIcon name="account" />
        </span>
        <span className={styles.accountLabel}>
          <strong>Acme Commerce India</strong>
          <small>Finance workspace</small>
        </span>
      </FinoraButton>
    </aside>
  );
}
