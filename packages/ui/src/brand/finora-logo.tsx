import type { SVGProps } from 'react';

export function FinoraMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M5 6.5h20v5H10v4.25h11v4.9H10V26H5V6.5Z" fill="currentColor" />
      <path
        d="M25 6.5v14.25a5.25 5.25 0 0 1-5.25 5.25H15v-5h4.75a.25.25 0 0 0 .25-.25V6.5h5Z"
        fill="currentColor"
        opacity=".38"
      />
    </svg>
  );
}
