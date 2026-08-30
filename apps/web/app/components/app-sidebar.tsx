import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FinoraButton, FinoraIcon, type FinoraIconName } from '@finora/ui';
import styles from './app-sidebar.module.css';

export const workspaceViews = [
  'Overview',
  'Chat',
  'Records',
  'Reconciliation',
  'Exceptions',
  'Organization',
  'Expenses',
  'Intelligence',
  'Notifications',
  'Operations',
  'Audit',
] as const;
export type WorkspaceView = (typeof workspaceViews)[number];

const navigationItems: Array<{ label: string; view: WorkspaceView; icon: FinoraIconName }> = [
  { label: 'Finora', view: 'Chat', icon: 'finora' },
  { label: 'Overview', view: 'Overview', icon: 'overview' },
  { label: 'Records', view: 'Records', icon: 'records' },
  { label: 'Reconciliation', view: 'Reconciliation', icon: 'reconciliation' },
  { label: 'Exceptions', view: 'Exceptions', icon: 'exceptions' },
  { label: 'Organization', view: 'Organization', icon: 'organization' },
  { label: 'Expenses', view: 'Expenses', icon: 'expenses' },
  { label: 'Agent control', view: 'Intelligence', icon: 'intelligence' },
  { label: 'Notifications', view: 'Notifications', icon: 'notifications' },
  { label: 'Operations', view: 'Operations', icon: 'operations' },
  { label: 'Audit', view: 'Audit', icon: 'audit' },
];

const employeeViews = new Set<WorkspaceView>(['Chat', 'Expenses', 'Notifications']);

export function AppSidebar({
  activeView,
  onNavigate,
  account,
  onSignOut,
}: {
  activeView: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  account?: { name: string; detail: string; role?: string };
  onSignOut?: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const visibleItems =
    account?.role === 'EMPLOYEE'
      ? navigationItems.filter((item) => employeeViews.has(item.view))
      : navigationItems;
  const activeIndex = visibleItems.findIndex((item) => item.view === activeView);
  const navStyle = { '--active-index': activeIndex } as CSSProperties;
  useEffect(() => {
    if (!accountOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [accountOpen]);

  return (
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/" aria-label="FinoraOS home">
        <img src="/brand/logo-mark.svg" alt="" />
        <span>FinoraOS</span>
      </a>
      <nav className={styles.nav} aria-label="Primary navigation" style={navStyle}>
        <span className={styles.indicator} aria-hidden="true" />
        {visibleItems.map(({ label, view, icon }, index) => (
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
      <div className={styles.accountWrap} ref={accountMenuRef}>
        {accountOpen && (
          <div className={styles.accountMenu} role="menu">
            <div className={styles.accountMenuIdentity}>
              <strong>{account?.name ?? 'Acme Commerce India'}</strong>
              <span>{account?.detail ?? 'Finance workspace'}</span>
            </div>
            <FinoraButton
              className={styles.signOut}
              variant="ghost"
              role="menuitem"
              onClick={onSignOut}
            >
              <FinoraIcon name="logout" />
              <span>Sign out</span>
            </FinoraButton>
          </div>
        )}
        <FinoraButton
          className={styles.account}
          variant="ghost"
          aria-label={`${account?.name ?? 'Acme Commerce India'} account menu`}
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((open) => !open)}
        >
          <span className={styles.accountIcon}>
            <FinoraIcon name="account" />
          </span>
          <span className={styles.accountLabel}>
            <strong>{account?.name ?? 'Acme Commerce India'}</strong>
            <small>{account?.detail ?? 'Finance workspace'}</small>
          </span>
          <FinoraIcon className={styles.accountChevron} name="chevronRight" />
        </FinoraButton>
      </div>
    </aside>
  );
}
