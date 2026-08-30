import type { ReactNode, SVGProps } from 'react';

export type FinoraIconName =
  | 'account'
  | 'add'
  | 'audit'
  | 'chevronRight'
  | 'check'
  | 'close'
  | 'exceptions'
  | 'finora'
  | 'history'
  | 'intelligence'
  | 'logout'
  | 'notifications'
  | 'overview'
  | 'organization'
  | 'expenses'
  | 'operations'
  | 'reconciliation'
  | 'records'
  | 'search'
  | 'send';

export function FinoraIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: FinoraIconName }) {
  const paths = {
    account: (
      <>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 20c.8-3.3 3-5 6.5-5s5.7 1.7 6.5 5" strokeLinecap="round" />
      </>
    ),
    add: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
    audit: (
      <>
        <path d="M6 3.5h12v17H6z" strokeLinejoin="round" />
        <path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round" />
        <path d="m14.5 16 1.5 1.5 3-3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    chevronRight: <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />,
    check: <path d="m5 12.5 4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" />,
    close: <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />,
    exceptions: (
      <>
        <path d="M12 4.2 20 19H4l8-14.8Z" strokeLinejoin="round" />
        <path d="M12 9v4.5M12 16.5h.01" strokeLinecap="round" />
      </>
    ),
    finora: (
      <>
        <path d="M7 5.5h10M7 12h7.5M7 18.5h5" strokeLinecap="round" />
        <path d="M17.5 11.5v5M15 14h5" strokeLinecap="round" />
      </>
    ),
    history: (
      <path
        d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5m4-3v6l4 2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    intelligence: (
      <>
        <path d="M8 5.5h8a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z" />
        <path d="M9 12h6M12 9v6M8 2.5v3M16 2.5v3M8 18.5v3M16 18.5v3" strokeLinecap="round" />
      </>
    ),
    logout: (
      <>
        <path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10" />
        <path d="M14 8l4 4-4 4M18 12H9" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    notifications: (
      <>
        <path
          d="M6.5 16.5h11l-1.2-2.2V10a4.3 4.3 0 0 0-8.6 0v4.3l-1.2 2.2Z"
          strokeLinejoin="round"
        />
        <path d="M10 19.2a2.2 2.2 0 0 0 4 0" strokeLinecap="round" />
      </>
    ),
    overview: (
      <>
        <rect x="4.5" y="4.5" width="6" height="6" rx="1" />
        <rect x="13.5" y="4.5" width="6" height="6" rx="1" />
        <rect x="4.5" y="13.5" width="6" height="6" rx="1" />
        <rect x="13.5" y="13.5" width="6" height="6" rx="1" />
      </>
    ),
    organization: (
      <>
        <rect x="9" y="3.5" width="6" height="5" rx="1" />
        <rect x="3.5" y="15.5" width="6" height="5" rx="1" />
        <rect x="14.5" y="15.5" width="6" height="5" rx="1" />
        <path d="M12 8.5v3.5M6.5 15.5V12h11v3.5" strokeLinecap="round" />
      </>
    ),
    expenses: (
      <>
        <path
          d="M6 3.5h12v17l-2.2-1.4-2 1.4-1.8-1.4-1.8 1.4-2-1.4L6 20.5v-17Z"
          strokeLinejoin="round"
        />
        <path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round" />
      </>
    ),
    operations: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path
          d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"
          strokeLinecap="round"
        />
      </>
    ),
    reconciliation: (
      <>
        <path d="M5 8.5A7.5 7.5 0 0 1 18.3 6M19 15.5A7.5 7.5 0 0 1 5.7 18" strokeLinecap="round" />
        <path
          d="m15.5 4.5 3 1.5-1.5 3M8.5 19.5l-3-1.5L7 15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    records: (
      <>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M8.5 9h7M8.5 13h7M8.5 17h4" strokeLinecap="round" />
      </>
    ),
    search: (
      <path
        d="m20 20-4.2-4.2M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"
        strokeLinecap="round"
      />
    ),
    send: <path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" strokeLinecap="round" strokeLinejoin="round" />,
  } satisfies Record<FinoraIconName, ReactNode>;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
