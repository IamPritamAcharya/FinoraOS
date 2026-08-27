# FinoraOS roadmap

## V1 — Buildathon foundation

- [x] Monorepo, Finora design system, Postgres/Redis Compose, migration/seed pipeline.
- [x] 240-record deterministic reconciliation evaluation with measured accuracy and honest exceptions.
- [x] Controlled AI chat, settlement Q&A, exception investigation, typed proposals, approval/audit/rerun.
- [x] Overview, records, reconciliation, exceptions, baseline cash forecast, and tax lines.
- [x] Keycloak login, workspace roles/permissions, and tenant-safe agent reads.
- [x] Organization hierarchy, node budgets, employee expenses, receipt upload, notifications, custom skills, agent audit, and policy/integration/job control surfaces.
- [x] Razorpay test-mode read adapter and Slack outbound reminder adapter.

## V1.x — Close the new operational loops

- Slack inbound receipts: signed events, idempotency, threaded request matching, file download, document persistence, and employee confirmation.
- Connector synchronization: Razorpay cursors/webhooks, persisted bank statements, generic ERP contracts, provenance, retry, and sync audit.
- Production document storage, malware scanning, OCR/extraction, duplicate detection, and review.
- Expense review/approval/reimbursement transitions and policy-aware escalation.
- Richer tax matching/evaluation and evidence views.
- Forecast scenarios and deterministic variance tracking.
- Policy evaluator for narrowly scoped autonomous closure with kill switches and post-action reconciliation.
- Playwright role/isolation coverage and a natural-language chat eval corpus.

## Later

- Multiple legal entities, currencies, periods, ledgers/journals, vendors/customers, chart of accounts, and ERP posting.
- Budget import/versioning, rollups, reforecasting, and spend-vs-budget intelligence.
- Deeper Razorpay/RazorpayX, banking, ERP, payroll, procurement, tax, and document connectors.
- Configurable approvals, delegation, notifications, Slack/Teams/email actions, and stronger segregation of duties.
- Cash scenario planning, collections/payables intelligence, anomaly detection, and explainable forecasts.
- Hardened deployment, secret manager, observability/tracing, retention controls, and compliance program.
