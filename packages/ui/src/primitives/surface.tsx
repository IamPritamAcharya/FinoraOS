import type { HTMLAttributes, PropsWithChildren } from 'react';

export function FinoraSurface({
  children,
  className = '',
  variant = 'default',
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLElement> & { variant?: 'default' | 'glass' }>) {
  return (
    <section
      {...props}
      className={`finora-ui-surface finora-ui-surface--${variant} ${className}`.trim()}
    >
      {children}
    </section>
  );
}
