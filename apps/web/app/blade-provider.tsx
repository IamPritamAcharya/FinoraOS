'use client';

import { BladeProvider } from '@razorpay/blade/components';
import { createTheme } from '@razorpay/blade/tokens';

// Keep the FinoraOS identity while using Blade's supported web theme contract.
// Provider setup lives here so app routes do not need to know Blade internals.
const { theme } = createTheme({ brandColor: '#2475d7' });

export function FinoraBladeProvider({ children }: { children: React.ReactNode }) {
  return <BladeProvider themeTokens={theme}>{children}</BladeProvider>;
}
