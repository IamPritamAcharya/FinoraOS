# Synthetic V1 dataset

The database seed contains 120 payment transactions, 12 settlements, 18 invoices/tax lines, and the existing demo exception history.

`reconciliation-fixture.ts` is the deterministic engine-evaluation input: 120 payment records and 120 mock-bank counterparts. It covers exact references, settlement relationships, date-window and composite matches, plus ambiguous, missing, and amount-mismatch cases. The expected output is checked in under `datasets/expected/` and is evaluated by `pnpm eval:reconciliation`.
