'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FinancialRecordType, money } from '@finora/platform';
import {
  Amount,
  FinoraButton,
  FinoraField,
  FinoraInput,
  FinoraSelect,
  StatusBadge,
} from '@finora/ui';
import styles from '../workspace.module.css';
import { finoraRequest as request } from '../lib/api';

type Data = Record<string, unknown>;
type FinanceView = 'overview' | 'records' | 'reconciliation' | 'exceptions';
type RecordTab =
  | 'transactions'
  | 'settlements'
  | 'invoices'
  | 'tax-lines'
  | 'cash-movements'
  | 'expense-claims';
function PageHeader({
  title,
  eyebrow = 'FINANCE OPERATIONS',
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {action ?? <div className={styles.profile}>AM</div>}
    </header>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className={styles.error}>
      <strong>Something needs attention.</strong>
      {message}
      <code>Confirm PostgreSQL, Redis and the API are running with pnpm dev.</code>
    </div>
  );
}

function LoadingState() {
  return (
    <div className={styles.loadingGrid}>
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

export function FinancePage({ view }: { view: FinanceView }) {
  if (view === 'overview') return <OverviewPage />;
  if (view === 'records') return <RecordsPage />;
  if (view === 'reconciliation') return <ReconciliationPage />;
  return <ExceptionsPage />;
}

function OverviewPage() {
  const [state, setState] = useState<{
    overview: Data;
    run: Data | null;
    exceptions: Data[];
    forecast: Data[];
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([
      request('/finance/overview'),
      request('/reconciliation/runs/latest'),
      request('/reconciliation/exceptions'),
      request('/finance/forecast'),
    ])
      .then(([overview, run, exceptions, forecast]) =>
        setState({
          overview: overview as Data,
          run: run as Data | null,
          exceptions: exceptions as Data[],
          forecast: forecast as Data[],
        }),
      )
      .catch((reason: Error) => setError(reason.message));
  }, []);
  if (error)
    return (
      <>
        <PageHeader title="Overview" />
        <ErrorState message={error} />
      </>
    );
  if (!state)
    return (
      <>
        <PageHeader title="Overview" />
        <LoadingState />
      </>
    );
  const open = state.exceptions.filter((item) => item.status !== 'RESOLVED');
  const cards = [
    { label: 'Current cash position', value: state.overview.cashPosition, amount: true },
    { label: 'Records processed', value: state.overview.recordsProcessed },
    { label: 'Open exceptions', value: state.overview.openExceptions },
    { label: 'Resolved safely', value: state.overview.agentResolved },
  ];
  return (
    <>
      <PageHeader title="Overview" />
      <div className={styles.metrics}>
        {cards.map((card) => (
          <article className={styles.metric} key={card.label}>
            <p>{card.label}</p>
            <strong>
              {card.amount ? <Amount value={String(card.value)} /> : String(card.value)}
            </strong>
            <span>
              {card.label === 'Open exceptions'
                ? 'Requires finance attention'
                : 'Live workspace data'}
            </span>
          </article>
        ))}
      </div>
      <div className={styles.twoCol}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Reconciliation health</h2>
              <p>Latest deterministic run</p>
            </div>
            <StatusBadge status={String(state.run?.status ?? 'PENDING')} />
          </div>
          {state.run ? (
            <div className={styles.health}>
              <Metric label="Records" value={state.run.recordsProcessed} />
              <Metric label="Matched" value={state.run.deterministicMatches} />
              <Metric label="Needs review" value={state.run.needsReview} />
              <Metric label="Unresolved" value={state.run.unresolved} />
            </div>
          ) : (
            <p className={styles.muted}>No reconciliation run yet.</p>
          )}
          <a className={styles.pageLink} href="/reconciliation">
            Open reconciliation →
          </a>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Forward cash position</h2>
              <p>Known scheduled movements only</p>
            </div>
          </div>
          <div className={styles.forecastList}>
            {state.forecast.slice(0, 5).map((row) => (
              <div key={String(row.date)} className={row.risk ? styles.riskRow : ''}>
                <span>{String(row.day)}</span>
                <strong>
                  <Amount value={String(row.amount)} />
                </strong>
                {row.risk ? <small>Shortfall risk</small> : null}
              </div>
            ))}
          </div>
        </section>
        <section className={`${styles.panel} ${styles.fullSpan}`}>
          <div className={styles.panelHead}>
            <div>
              <h2>Priority exceptions</h2>
              <p>{open.length} items remain open</p>
            </div>
            <a className={styles.pageLink} href="/exceptions">
              View queue →
            </a>
          </div>
          <div className={styles.priorityGrid}>
            {open.slice(0, 4).map((item) => (
              <div className={styles.miniRow} key={String(item.id)}>
                <div>
                  <strong>{String(item.externalId)}</strong>
                  <span>{String(item.type).replaceAll('_', ' ')}</span>
                </div>
                <StatusBadge status={String(item.status)} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className={styles.runMetric}>
      <strong>{String(value ?? 0)}</strong>
      <span>{label}</span>
    </div>
  );
}

function ReconciliationPage() {
  const [run, setRun] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      request('/reconciliation/runs/latest')
        .then((value) => setRun(value as Data | null))
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const start = async () => {
    setRunning(true);
    setError('');
    try {
      await request('/reconciliation/runs', { method: 'POST' });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setRunning(false);
    }
  };
  const processed = Number(run?.recordsProcessed ?? 0);
  const closed = Number(run?.deterministicMatches ?? 0) + Number(run?.agentResolved ?? 0);
  return (
    <>
      <PageHeader
        title="Reconciliation"
        eyebrow="DETERMINISTIC CONTROL"
        action={
          <FinoraButton onClick={() => void start()} disabled={running}>
            {running ? 'Running…' : 'Run reconciliation'}
          </FinoraButton>
        }
      />
      {error && <ErrorState message={error} />}
      {loading ? (
        <LoadingState />
      ) : (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Latest matching run</h2>
              <p>Exact reference → settlement relation → date window → composite score</p>
            </div>
            <StatusBadge status={String(run?.status ?? 'PENDING')} />
          </div>
          {run ? (
            <>
              <div className={styles.runGrid}>
                <Metric label="Records processed" value={run.recordsProcessed} />
                <Metric label="Deterministic matches" value={run.deterministicMatches} />
                <Metric label="Exceptions" value={run.exceptionsGenerated} />
                <Metric
                  label="Auto-close rate"
                  value={processed ? `${((closed / processed) * 100).toFixed(1)}%` : '0.0%'}
                />
              </div>
              <p className={styles.muted}>
                Started{' '}
                {new Intl.DateTimeFormat('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(String(run.startedAt)))}
                . Ambiguous records are never forced into matches.
              </p>
            </>
          ) : (
            <p className={styles.muted}>Run reconciliation to create the first measured result.</p>
          )}
        </section>
      )}
    </>
  );
}

function ExceptionsPage() {
  const [items, setItems] = useState<Data[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      request('/reconciliation/exceptions')
        .then((value) => setItems(value as Data[]))
        .catch((reason: Error) => setError(reason.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const mutate = async (id: string, path: string, body?: object) => {
    setBusy(id);
    setError('');
    try {
      await request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <PageHeader title="Exceptions" eyebrow="CONTROLLED CLOSURE" />
      {error && <ErrorState message={error} />}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>Investigate and close safely</h2>
            <p>Evidence, proposal, approval, adjustment, rerun</p>
          </div>
          <span className={styles.count}>{items.length}</span>
        </div>
        <div className={styles.exceptionList}>
          {items.map((item) => {
            const variance = money(String(item.expectedAmount))
              .minus(String(item.receivedAmount))
              .abs()
              .toFixed(2);
            const resolution =
              item.resolution && typeof item.resolution === 'object'
                ? (item.resolution as Data)
                : null;
            return (
              <article className={styles.exceptionRow} key={String(item.id)}>
                <div className={styles.exceptionSummary}>
                  <div>
                    <strong>{String(item.externalId)}</strong>
                    <span>{String(item.type).replaceAll('_', ' ')}</span>
                  </div>
                  <Amount value={variance} />
                  <StatusBadge status={String(item.status)} />
                </div>
                <p>{String(item.reason)}</p>
                {resolution && (
                  <div className={styles.proposal}>
                    <span>Proposed resolution</span>
                    <strong>{String(resolution.reason ?? 'Validated finance action')}</strong>
                    <small>
                      Confidence {Math.round(Number(resolution.confidence ?? 0) * 100)}% · no raw
                      record mutation
                    </small>
                  </div>
                )}
                <div className={styles.rowActions}>
                  {item.status === 'OPEN' && (
                    <FinoraButton
                      size="small"
                      variant="secondary"
                      disabled={busy === item.id}
                      onClick={() =>
                        void mutate(String(item.id), `/agents/exceptions/${item.id}/investigate`)
                      }
                    >
                      Investigate
                    </FinoraButton>
                  )}
                  {item.status === 'PROPOSED' && (
                    <>
                      <FinoraButton
                        size="small"
                        disabled={busy === item.id}
                        onClick={() =>
                          void mutate(
                            String(item.id),
                            `/reconciliation/exceptions/${item.id}/approve`,
                          )
                        }
                      >
                        Approve & rerun
                      </FinoraButton>
                      <FinoraButton
                        size="small"
                        variant="ghost"
                        disabled={busy === item.id}
                        onClick={() =>
                          void mutate(
                            String(item.id),
                            `/reconciliation/exceptions/${item.id}/reject`,
                            { reason: 'Rejected by finance user from the exception queue.' },
                          )
                        }
                      >
                        Reject
                      </FinoraButton>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

const tabLabels: Array<{ id: RecordTab; label: string }> = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'tax-lines', label: 'Tax lines' },
  { id: 'cash-movements', label: 'Cash movements' },
  { id: 'expense-claims', label: 'Expenses' },
];

const recordTypes: Record<RecordTab, FinancialRecordType> = {
  transactions: FinancialRecordType.TRANSACTION,
  settlements: FinancialRecordType.SETTLEMENT,
  invoices: FinancialRecordType.INVOICE,
  'tax-lines': FinancialRecordType.TAX_LINE,
  'cash-movements': FinancialRecordType.CASH_MOVEMENT,
  'expense-claims': FinancialRecordType.EXPENSE_CLAIM,
};

function RecordsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedTab = params.get('tab') as RecordTab | null;
  const tab = tabLabels.some((item) => item.id === requestedTab) ? requestedTab! : 'transactions';
  const [records, setRecords] = useState<Record<RecordTab, Data[]>>({
    transactions: [],
    settlements: [],
    invoices: [],
    'tax-lines': [],
    'cash-movements': [],
    'expense-claims': [],
  });
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; row?: Data } | null>(null);
  const [importResult, setImportResult] = useState<Data | null>(null);
  const loadRecords = useCallback(
    () =>
      Promise.all(tabLabels.map((item) => request(`/finance/${item.id}`))).then((values) =>
        setRecords(
          Object.fromEntries(tabLabels.map((item, index) => [item.id, values[index]])) as Record<
            RecordTab,
            Data[]
          >,
        ),
      ),
    [],
  );
  useEffect(() => {
    void loadRecords().catch((reason: Error) => setError(reason.message));
  }, [loadRecords]);
  const visible = useMemo(
    () =>
      records[tab].filter(
        (row) => !query || JSON.stringify(row).toLowerCase().includes(query.toLowerCase()),
      ),
    [query, records, tab],
  );
  return (
    <>
      <PageHeader
        title="Records"
        action={
          <div className={styles.rowActions}>
            <FinoraButton variant="secondary" onClick={() => setShowImport((value) => !value)}>
              {showImport ? 'Close import' : 'Import CSV'}
            </FinoraButton>
            <FinoraButton onClick={() => setEditor({ mode: 'create' })}>
              Create one record
            </FinoraButton>
          </div>
        }
      />
      {showImport && (
        <RecordImport
          onImported={async (result) => {
            setImportResult(result);
            await loadRecords();
          }}
        />
      )}
      {importResult && (
        <div className={styles.importResult}>
          <strong>{String(importResult.succeededCount)} records imported</strong>
          <span>
            {String(importResult.failedCount)} rejected ·{' '}
            {String((importResult.warnings as unknown[] | undefined)?.length ?? 0)} category
            warnings
          </span>
          {Number(importResult.failedCount) > 0 ? (
            <small>
              Open the import result below to correct rejected rows; accepted rows are already
              audited.
            </small>
          ) : null}
        </div>
      )}
      {editor && (
        <RecordEditor
          tab={tab}
          row={editor.row}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await loadRecords();
          }}
        />
      )}
      <div className={styles.recordToolbar}>
        <div className={styles.tabs}>
          {tabLabels.map((item) => (
            <FinoraButton
              key={item.id}
              variant={tab === item.id ? 'primary' : 'ghost'}
              size="small"
              onClick={() => router.push(`/records?tab=${item.id}`)}
            >
              {item.label}
            </FinoraButton>
          ))}
        </div>
        <input
          className={styles.recordSearch}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search visible records"
        />
      </div>
      {error ? (
        <ErrorState message={error} />
      ) : (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>{tabLabels.find((item) => item.id === tab)?.label}</h2>
              <p>Organization-scoped, traceable source records</p>
            </div>
            <span className={styles.count}>{visible.length}</span>
          </div>
          <RecordTable
            tab={tab}
            rows={visible}
            onEdit={(row) => setEditor({ mode: 'edit', row })}
          />
        </section>
      )}
    </>
  );
}

function RecordImport({ onImported }: { onImported: (result: Data) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className={styles.importPanel}
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        const values = new FormData(event.currentTarget);
        const file = values.get('file');
        if (!(file instanceof File) || !file.size) {
          setError('Choose an invoice or expense CSV file.');
          setSaving(false);
          return;
        }
        const body = new FormData();
        body.append('file', file);
        try {
          const result = (await request(`/workspace/imports?type=${values.get('type')}`, {
            method: 'POST',
            body,
          })) as Data;
          await onImported(result);
        } catch (reason) {
          setError((reason as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div>
        <p className={styles.eyebrow}>AUDITED CSV IMPORT</p>
        <h2>Add invoices or reimbursements</h2>
        <span>
          Hard-limit breaches are rejected. Category overages are recorded and notify Finance and
          the node owner.
        </span>
      </div>
      <FinoraField label="Record type">
        <FinoraSelect name="type" defaultValue="EXPENSE">
          <option value="EXPENSE">Expenses / reimbursements</option>
          <option value="INVOICE">Vendor invoices</option>
        </FinoraSelect>
      </FinoraField>
      <FinoraField label="CSV file" hint="Up to 500 rows and 2 MB">
        <FinoraInput name="file" type="file" accept="text/csv,.csv" required />
      </FinoraField>
      <FinoraButton type="submit" disabled={saving}>
        {saving ? 'Validating rows…' : 'Validate & import'}
      </FinoraButton>
      <p className={styles.importHelp}>
        <strong>Expense columns:</strong> externalId, employeeEmail, merchant, amount, currency,
        incurredAt, nodeCode, category, description
        <br />
        <strong>Invoice columns:</strong> externalId, vendor, amount, currency, issuedAt, dueAt,
        nodeCode, category, direction
      </p>
      {error ? <span className={styles.importError}>{error}</span> : null}
    </form>
  );
}

function RecordTable({
  tab,
  rows,
  onEdit,
}: {
  tab: RecordTab;
  rows: Data[];
  onEdit: (row: Data) => void;
}) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Description / date</th>
            <th>Type</th>
            <th>Status</th>
            <th>Amount</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((item, index) => (
            <tr key={String(item.id ?? item.externalId ?? index)}>
              <td>
                <strong>{String(item.externalId ?? item.name ?? 'Record')}</strong>
                <small>{String(item.currency ?? 'INR')}</small>
              </td>
              <td>
                {String(
                  item.description ??
                    item.counterparty ??
                    (item.occurredAt || item.settledAt || item.issuedAt
                      ? new Date(
                          String(item.occurredAt ?? item.settledAt ?? item.issuedAt),
                        ).toLocaleDateString('en-IN')
                      : '—'),
                )}
              </td>
              <td>{String(item.category ?? item.type ?? tab).replaceAll('_', ' ')}</td>
              <td>
                <StatusBadge
                  status={
                    item.matched === true
                      ? 'MATCHED'
                      : item.matched === false
                        ? 'NEEDS_REVIEW'
                        : String(item.status ?? 'POSTED')
                  }
                />
              </td>
              <td>
                <Amount value={String(item.amount ?? item.receivedAmount ?? '0')} />
              </td>
              <td>
                <FinoraButton size="small" variant="ghost" onClick={() => onEdit(item)}>
                  Edit
                </FinoraButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RecordField = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'datetime-local' | 'select';
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
};

const categoryOptions = [
  'COLLECTION',
  'GATEWAY_FEE',
  'GST',
  'REFUND',
  'VENDOR_PAYMENT',
  'PAYROLL',
  'RENT',
  'TAX_PAYMENT',
  'TRAVEL',
  'MEALS',
  'LODGING',
  'LOCAL_TRANSPORT',
  'SOFTWARE',
  'OFFICE_SUPPLIES',
  'MARKETING',
  'PROFESSIONAL_SERVICES',
  'UTILITIES',
  'OTHER',
].map((value) => ({ value, label: value.replaceAll('_', ' ') }));

const fixedOptions = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll('_', ' ') }));

const fieldsFor = (tab: RecordTab, options: Data): RecordField[] => {
  const nodes = Array.isArray(options.nodes) ? (options.nodes as Data[]) : [];
  const users = Array.isArray(options.users) ? (options.users as Data[]) : [];
  const accounts = Array.isArray(options.accounts) ? (options.accounts as Data[]) : [];
  const settlements = Array.isArray(options.settlements) ? (options.settlements as Data[]) : [];
  const commonAmount: RecordField[] = [
    { name: 'amount', label: 'Amount', type: 'number', required: true },
    { name: 'currency', label: 'Currency', required: true },
  ];
  if (tab === 'transactions')
    return [
      ...commonAmount,
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: fixedOptions(['CAPTURED', 'REFUNDED', 'PENDING']),
      },
      { name: 'occurredAt', label: 'Occurred at', type: 'datetime-local', required: true },
      {
        name: 'settlementId',
        label: 'Settlement',
        type: 'select',
        options: settlements.map((item) => ({
          value: String(item.id),
          label: String(item.externalId),
        })),
      },
    ];
  if (tab === 'settlements')
    return [
      { name: 'expectedAmount', label: 'Expected amount', type: 'number', required: true },
      { name: 'receivedAmount', label: 'Received amount', type: 'number', required: true },
      { name: 'feeAmount', label: 'Gateway fee', type: 'number', required: true },
      { name: 'gstAmount', label: 'GST', type: 'number', required: true },
      { name: 'refundAmount', label: 'Refunds', type: 'number', required: true },
      { name: 'settledAt', label: 'Settled at', type: 'datetime-local', required: true },
    ];
  if (tab === 'invoices')
    return [
      ...commonAmount,
      { name: 'vendor', label: 'Vendor' },
      {
        name: 'direction',
        label: 'Direction',
        type: 'select',
        options: fixedOptions(['PAYABLE', 'RECEIVABLE']),
      },
      { name: 'category', label: 'Category', type: 'select', options: categoryOptions },
      { name: 'status', label: 'Status' },
      {
        name: 'nodeId',
        label: 'Organization node',
        type: 'select',
        options: nodes.map((item) => ({
          value: String(item.id),
          label: `${String(item.name)} · ${String(item.code)}`,
        })),
      },
      { name: 'issuedAt', label: 'Issued at', type: 'datetime-local', required: true },
      { name: 'dueAt', label: 'Due at', type: 'datetime-local' },
    ];
  if (tab === 'tax-lines')
    return [
      { name: 'amount', label: 'Tax amount', type: 'number', required: true },
      { name: 'taxRate', label: 'Tax rate', type: 'number', required: true },
      { name: 'taxType', label: 'Tax type', required: true },
      { name: 'taxPeriod', label: 'Tax period' },
      { name: 'counterpartyTaxId', label: 'Counterparty tax ID' },
      {
        name: 'matchStatus',
        label: 'Match status',
        type: 'select',
        options: fixedOptions(['MATCHED', 'AMBIGUOUS', 'UNMATCHED', 'NEEDS_REVIEW']),
      },
    ];
  if (tab === 'cash-movements')
    return [
      ...commonAmount,
      {
        name: 'accountId',
        label: 'Cash account',
        type: 'select',
        required: true,
        options: accounts.map((item) => ({ value: String(item.id), label: String(item.name) })),
      },
      {
        name: 'direction',
        label: 'Direction',
        type: 'select',
        options: fixedOptions(['INFLOW', 'OUTFLOW']),
      },
      { name: 'category', label: 'Category', type: 'select', options: categoryOptions },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: fixedOptions(['POSTED', 'SCHEDULED', 'CANCELLED']),
      },
      { name: 'description', label: 'Description', required: true },
      { name: 'counterparty', label: 'Counterparty' },
      { name: 'occurredAt', label: 'Occurred at', type: 'datetime-local', required: true },
    ];
  return [
    ...commonAmount,
    {
      name: 'claimantUserId',
      label: 'Employee',
      type: 'select',
      required: true,
      options: users.map((item) => ({
        value: String(item.id),
        label: `${String(item.name)} · ${String(item.email)}`,
      })),
    },
    {
      name: 'nodeId',
      label: 'Organization node',
      type: 'select',
      required: true,
      options: nodes.map((item) => ({
        value: String(item.id),
        label: `${String(item.name)} · ${String(item.code)}`,
      })),
    },
    { name: 'merchant', label: 'Merchant', required: true },
    { name: 'category', label: 'Category', type: 'select', options: categoryOptions },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: fixedOptions(['DRAFT', 'RECEIPT_REQUIRED', 'SUBMITTED', 'UNDER_REVIEW']),
    },
    { name: 'incurredAt', label: 'Incurred at', type: 'datetime-local', required: true },
    { name: 'description', label: 'Description', required: true },
  ];
};

const inputValue = (row: Data | undefined, name: string) => {
  const value = row?.[name];
  if (value === null || value === undefined) return '';
  if (name.endsWith('At')) {
    const date = new Date(String(value));
    return Number.isNaN(date.valueOf()) ? '' : date.toISOString().slice(0, 16);
  }
  return String(value);
};

function RecordEditor({
  tab,
  row,
  onClose,
  onSaved,
}: {
  tab: RecordTab;
  row?: Data;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [options, setOptions] = useState<Data>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void request('/finance/record-options').then((value) => setOptions(value as Data));
  }, []);
  const fields = fieldsFor(tab, options).filter(
    (field) => !row || (field.name !== 'accountId' && field.name !== 'claimantUserId'),
  );
  return (
    <form
      className={styles.recordEditor}
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        const values = new FormData(event.currentTarget);
        const submitted = Object.fromEntries(
          fields
            .map((field) => [field.name, values.get(field.name)])
            .filter(([, value]) => value !== '' && value !== null),
        );
        if (tab === 'tax-lines' && submitted.matchStatus) {
          submitted.matched = submitted.matchStatus === 'MATCHED';
        }
        const data = row
          ? Object.fromEntries(
              Object.entries(submitted).filter(
                ([name, value]) => inputValue(row, name) !== String(value),
              ),
            )
          : submitted;
        try {
          if (row) {
            if (!Object.keys(data).length) {
              setError('Change at least one field before saving.');
              return;
            }
            await request(`/finance/records/${String(row.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({
                expectedVersion: Number(row.version ?? 1),
                mutation: {
                  entityType: recordTypes[tab],
                  changes: data,
                  reason: 'Updated from the Records workspace.',
                },
              }),
            });
          } else {
            const externalId = String(values.get('externalId') ?? '').trim();
            await request('/finance/records', {
              method: 'POST',
              body: JSON.stringify({
                entityType: recordTypes[tab],
                data: { externalId, ...data },
              }),
            });
          }
          await onSaved();
        } catch (reason) {
          setError((reason as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>{row ? 'EDIT TRACEABLE RECORD' : 'CREATE ONE RECORD'}</p>
          <h2>{row ? String(row.externalId) : tabLabels.find((item) => item.id === tab)?.label}</h2>
        </div>
        <FinoraButton size="small" variant="ghost" onClick={onClose}>
          Close
        </FinoraButton>
      </div>
      <div className={styles.recordEditorGrid}>
        {!row && (
          <FinoraField label="Reference">
            <FinoraInput name="externalId" required placeholder="Unique external reference" />
          </FinoraField>
        )}
        {fields.map((field) => (
          <FinoraField key={field.name} label={field.label}>
            {field.type === 'select' ? (
              <FinoraSelect
                name={field.name}
                defaultValue={inputValue(row, field.name)}
                required={field.required}
              >
                <option value="">Select</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </FinoraSelect>
            ) : (
              <FinoraInput
                name={field.name}
                type={field.type ?? 'text'}
                step={field.type === 'number' ? '0.01' : undefined}
                defaultValue={inputValue(row, field.name)}
                required={field.required}
              />
            )}
          </FinoraField>
        ))}
      </div>
      <div className={styles.rowActions}>
        <FinoraButton type="submit" disabled={saving}>
          {saving ? 'Saving…' : row ? 'Save audited update' : 'Create record'}
        </FinoraButton>
        <span className={styles.muted}>
          Every create and edit is organization-scoped and added to Audit.
        </span>
      </div>
      {error ? <span className={styles.importError}>{error}</span> : null}
    </form>
  );
}
