import { notFound } from 'next/navigation';
import { FinancePage } from '../components/finance-pages';
import { WorkspacePage } from '../components/workspace-pages';

const financeViews = new Set(['overview', 'records', 'reconciliation', 'exceptions']);
const workspaceViews = new Set([
  'organization',
  'expenses',
  'intelligence',
  'notifications',
  'operations',
  'audit',
]);

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (financeViews.has(view)) {
    return <FinancePage view={view as 'overview' | 'records' | 'reconciliation' | 'exceptions'} />;
  }
  if (workspaceViews.has(view)) return <WorkspacePage view={view} />;
  notFound();
}
