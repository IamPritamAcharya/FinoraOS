import type { ExceptionStatus, ReconciliationStatus } from '@finora/platform';

const labels: Record<string, string> = {
  ACTIVE: 'Active',
  AMBIGUOUS: 'Ambiguous',
  APPROVED: 'Approved',
  CANCELLED: 'Cancelled',
  CAPTURED: 'Captured',
  DRAFT: 'Draft',
  EXTRACTED: 'Extracted',
  FAILED: 'Failed',
  MATCHED: 'Matched',
  OVERDUE: 'Overdue',
  PAID: 'Paid',
  PARTIALLY_COLLECTED: 'Partially collected',
  PARTIALLY_PAID: 'Partially paid',
  PENDING: 'Pending',
  POSTED: 'Posted',
  RECEIPT_REQUIRED: 'Receipt required',
  REFUNDED: 'Refunded',
  REIMBURSED: 'Reimbursed',
  REJECTED: 'Rejected',
  RESOLVED: 'Resolved by agent',
  SCHEDULED: 'Scheduled',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
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
      {label ??
        labels[status] ??
        status
          .toLowerCase()
          .replaceAll('_', ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase())}
    </span>
  );
}
