import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'small' | 'medium';

export type FinoraButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>;

export function FinoraButton({
  children,
  className = '',
  variant = 'primary',
  size = 'medium',
  type = 'button',
  ...props
}: FinoraButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`finora-ui-button finora-ui-button--${variant} finora-ui-button--${size} ${className}`.trim()}
    >
      {children}
    </button>
  );
}

export type FinoraIconButtonProps = Omit<FinoraButtonProps, 'children'> & {
  children: ReactNode;
};

export function FinoraIconButton({ className = '', ...props }: FinoraIconButtonProps) {
  return <FinoraButton {...props} className={`finora-ui-icon-button ${className}`.trim()} />;
}
