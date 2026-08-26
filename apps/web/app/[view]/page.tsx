import { notFound } from 'next/navigation';
import { FinancePage } from '../components/finance-pages';

const views = new Set(['overview', 'records', 'reconciliation', 'exceptions']);

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!views.has(view)) notFound();
  return <FinancePage view={view as 'overview' | 'records' | 'reconciliation' | 'exceptions'} />;
}
