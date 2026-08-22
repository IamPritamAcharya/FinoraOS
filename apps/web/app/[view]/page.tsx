import { notFound } from 'next/navigation';
import Workspace from '../page';

const views = new Set(['overview', 'records', 'reconciliation', 'exceptions']);

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!views.has(view)) notFound();
  return <Workspace />;
}
