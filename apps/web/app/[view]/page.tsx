import { notFound, redirect } from 'next/navigation';
import { FinancePage } from '../components/finance-pages';
import { WorkspacePage } from '../components/workspace-pages';

const financeViews = new Set(['overview', 'records', 'exceptions']);
const workspaceViews = new Set([
  'organization',
  'intelligence',
  'notifications',
  'operations',
  'audit',
]);

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (view === 'reconciliation') redirect('/overview');
  if (view === 'expenses') redirect('/records?tab=expense-claims');
  if (financeViews.has(view)) {
    return <FinancePage view={view as 'overview' | 'records' | 'exceptions'} />;
  }
  if (workspaceViews.has(view)) return <WorkspacePage view={view} />;
  notFound();
}
