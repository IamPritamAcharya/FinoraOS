import type { Metadata } from 'next';
import './globals.css';
import { WorkspaceShell } from './components/workspace-shell';
import { AuthProvider } from './components/auth-provider';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000'),
  title: 'FinoraOS — Finance Operations',
  description: 'AI-native financial operations. Reconcile. Investigate. Close.',
  icons: { icon: '/brand/favicon.svg' },
  openGraph: {
    title: 'FinoraOS',
    description: 'AI-native financial operations',
    images: ['/brand/social-preview.svg'],
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <WorkspaceShell>{children}</WorkspaceShell>
        </AuthProvider>
      </body>
    </html>
  );
}
