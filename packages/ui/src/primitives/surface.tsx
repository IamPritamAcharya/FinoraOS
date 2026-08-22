import type { HTMLAttributes, PropsWithChildren } from 'react';

export function FinoraSurface({
  children,
  className = '',
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <section {...props} className={`finora-ui-surface ${className}`.trim()}>
      {children}
    </section>
  );
}
