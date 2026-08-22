import type { ExceptionStatus, ReconciliationStatus } from '@finora/platform';

const labels: Record<string, string> = {
  MATCHED: 'Matched',
  RESOLVED: 'Resolved by agent',
  NEEDS_REVIEW: 'Needs review',
  UNMATCHED: 'Unmatched',
  OPEN: 'Open',
  PROPOSED: 'Approval pending',
  UNRESOLVED: 'Unresolved',
};
export function StatusBadge({
  status,
}: {
  status: ExceptionStatus | ReconciliationStatus | string;
}) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>{labels[status] ?? status}</span>
  );
}
