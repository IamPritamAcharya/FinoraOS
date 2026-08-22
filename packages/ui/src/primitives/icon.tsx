import type { ReactNode, SVGProps } from 'react';

export type FinoraIconName =
  | 'account'
  | 'exceptions'
  | 'finora'
  | 'overview'
  | 'reconciliation'
  | 'records';

export function FinoraIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: FinoraIconName }) {
  const paths = {
    account: (
      <>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 20c.8-3.3 3-5 6.5-5s5.7 1.7 6.5 5" strokeLinecap="round" />
      </>
    ),
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
    overview: (
      <>
        <rect x="4.5" y="4.5" width="6" height="6" rx="1" />
        <rect x="13.5" y="4.5" width="6" height="6" rx="1" />
        <rect x="4.5" y="13.5" width="6" height="6" rx="1" />
        <rect x="13.5" y="13.5" width="6" height="6" rx="1" />
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
  } satisfies Record<FinoraIconName, ReactNode>;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
