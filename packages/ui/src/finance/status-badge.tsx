import type { ExceptionStatus, ReconciliationStatus } from '@finora/platform';

const labels: Record<string, string> = {
  MATCHED: 'Matched',
  RESOLVED: 'Resolved by agent',
  NEEDS_REVIEW: 'Needs review',
  UNMATCHED: 'Unmatched',
  OPEN: 'Open',
  PROPOSED: 'Approval pending',
  UNRESOLVED: 'Unresolved',
  SUPERSEDED: 'Superseded by rerun',
};
export function StatusBadge({
  status,
  label,
}: {
  status: ExceptionStatus | ReconciliationStatus | string;
  /** Keeps the semantic status treatment while allowing contextual copy. */
  label?: string;
}) {
  return (
    <span className={`finora-status finora-status--${status.toLowerCase()}`}>
      {label ?? labels[status] ?? status}
    </span>
  );
}
