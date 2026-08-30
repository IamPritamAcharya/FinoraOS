'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FinancialRecordType, money } from '@finora/platform';
import {
  Amount,
  FinoraButton,
  FinoraField,
  FinoraIcon,
  FinoraInput,
  FinoraSelect,
  FinoraSurface,
  StatusBadge,
} from '@finora/ui';
import styles from '../workspace.module.css';
import { finoraRequest as request } from '../lib/api';

type Data = Record<string, unknown>;
type FinanceView = 'overview' | 'records' | 'exceptions';
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
  description,
  action,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className={styles.pageDescription}>{description}</p> : null}
      </div>
      {action ? <div className={styles.pageActions}>{action}</div> : null}
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
  return <ExceptionsPage />;
}

function OverviewPage() {
  const router = useRouter();
  const [state, setState] = useState<{
    overview: Data;
    run: Data | null;
    exceptions: Data[];
    forecast: Data[];
  } | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const load = useCallback(() => {
    setError('');
    return Promise.all([
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
  useEffect(() => {
    void load();
  }, [load]);
  const runReconciliation = async () => {
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
  if (!state)
    return (
      <>
        <PageHeader title="Overview" />
        {error ? <ErrorState message={error} /> : <LoadingState />}
      </>
    );
  const open = state.exceptions.filter((item) => item.status !== 'RESOLVED');
  const processed = Number(state.run?.recordsProcessed ?? state.overview.recordsProcessed ?? 0);
  const deterministicMatches = Number(state.run?.deterministicMatches ?? 0);
  const agentResolved = Number(state.run?.agentResolved ?? state.overview.agentResolved ?? 0);
  const closed = deterministicMatches + agentResolved;
  const coverage = processed ? Math.round((closed / processed) * 100) : 0;
  const maxForecast = Math.max(
    ...state.forecast.map((item) => Math.abs(Number(item.amount ?? 0))),
    1,
  );
  return (
    <>
      <PageHeader
        title="Overview"
        description="Current financial position, reconciliation results, and items that need attention."
        action={
          <>
            <FinoraButton variant="secondary" onClick={() => router.push('/')}>
              Ask Finora
            </FinoraButton>
            <FinoraButton onClick={() => void runReconciliation()} disabled={running}>
              {running ? 'Running reconciliation…' : 'Run reconciliation'}
            </FinoraButton>
          </>
        }
      />
      {error ? <ErrorState message={error} /> : null}
      <FinoraSurface className={styles.cashOverview} variant="glass">
        <div className={styles.cashOverviewBalance}>
          <span>Current cash position</span>
          <strong>
            <Amount value={String(state.overview.cashPosition)} />
          </strong>
          <p>Posted movements across connected cash accounts.</p>
        </div>
        <div className={styles.cashOverviewForecast}>
          <div className={styles.cashOverviewHeading}>
            <span>Forward cash position</span>
            <small>Known scheduled movements</small>
          </div>
          <div className={styles.cashOverviewChart}>
            {state.forecast.slice(0, 5).map((row) => {
              const ratio = Math.max(
                9,
                Math.round((Math.abs(Number(row.amount ?? 0)) / maxForecast) * 100),
              );
              return (
                <div key={String(row.date)} className={row.risk ? styles.cashChartRisk : ''}>
                  <span className={styles.cashChartBar} style={{ height: `${ratio}%` }} />
                  <strong>{String(row.day)}</strong>
                  <small>
                    <Amount value={String(row.amount)} compact />
                  </small>
                </div>
              );
            })}
          </div>
        </div>
      </FinoraSurface>
      <div className={styles.overviewGrid}>
        <FinoraSurface className={`${styles.panel} ${styles.coveragePanel}`}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitle}>
              <h2>Reconciliation coverage</h2>
              <p>
                {state.run
                  ? 'Latest deterministic matching result'
                  : 'Run reconciliation to establish match coverage'}
              </p>
            </div>
            <FinoraButton
              size="small"
              variant="ghost"
              onClick={() => void runReconciliation()}
              disabled={running}
            >
              {running ? 'Running…' : 'Run again'} <FinoraIcon name="arrowUpRight" />
            </FinoraButton>
          </div>
          <div className={styles.coverageLayout}>
            <div className={styles.coverageScore}>
              <strong>{coverage}%</strong>
              <span>coverage</span>
            </div>
            <div className={styles.coverageDetails}>
              <strong>
                {processed ? `${closed} of ${processed} records` : 'No records processed yet'}
              </strong>
              <p>Matched or approved. Ambiguous records remain visible for finance review.</p>
              <div
                className={styles.coverageProgress}
                aria-label={`${coverage}% reconciliation coverage`}
              >
                <span style={{ width: `${coverage}%` }} />
              </div>
            </div>
          </div>
          <div className={styles.coverageFootnotes}>
            <span>
              <strong>{deterministicMatches}</strong>
              Deterministic matches
            </span>
            <span>
              <strong>{open.length}</strong>
              Exceptions needing review
            </span>
            <span>
              <strong>{agentResolved}</strong>
              Resolved by agent
            </span>
            <span>
              <strong>{Number(state.run?.unresolved ?? 0)}</strong>
              Unresolved
            </span>
          </div>
          <div className={styles.coverageRunMeta}>
            <span>Latest run</span>
            <StatusBadge status={String(state.run?.status ?? 'PENDING')} />
            <span>
              {state.run?.startedAt
                ? new Intl.DateTimeFormat('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(new Date(String(state.run.startedAt)))
                : 'Awaiting first run'}
            </span>
          </div>
        </FinoraSurface>
        <FinoraSurface className={`${styles.panel} ${styles.queuePanel}`}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitle}>
              <h2>Priority queue</h2>
              <p>
                {open.length ? 'Ranked by variance and decision state' : 'No active exceptions'}
              </p>
            </div>
            <div className={styles.queueHeadActions}>
              <FinoraButton size="small" variant="ghost" onClick={() => router.push('/exceptions')}>
                View queue <FinoraIcon name="arrowUpRight" />
              </FinoraButton>
            </div>
          </div>
          {open.length ? (
            <div className={styles.queueList}>
              {open.slice(0, 4).map((item) => {
                const variance = money(String(item.expectedAmount ?? 0))
                  .minus(String(item.receivedAmount ?? 0))
                  .abs()
                  .toFixed(2);
                return (
                  <button
                    type="button"
                    className={styles.queueRow}
                    key={String(item.id)}
                    onClick={() => router.push('/exceptions')}
                  >
                    <span className={styles.queueReference}>
                      <span>
                        <strong>{String(item.externalId)}</strong>
                        <small>{String(item.type).replaceAll('_', ' ')}</small>
                      </span>
                    </span>
                    <span className={styles.queueVariance}>
                      <Amount value={variance} />
                      <StatusBadge status={String(item.status)} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={styles.queueEmpty}>
              <FinoraIcon name="check" />
              <strong>The exception queue is clear.</strong>
              <span>New exceptions will appear here after a reconciliation run.</span>
            </div>
          )}
        </FinoraSurface>
        <FinoraSurface className={`${styles.panel} ${styles.settlementPanel}`}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitle}>
              <h2>Recent settlements</h2>
              <p>Latest source records received in this workspace</p>
            </div>
            <FinoraButton
              size="small"
              variant="ghost"
              onClick={() => router.push('/records?tab=settlements')}
            >
              All settlements <FinoraIcon name="arrowUpRight" />
            </FinoraButton>
          </div>
          <div className={styles.settlementList}>
            {(state.overview.recentSettlements as Data[]).slice(0, 4).map((settlement) => {
              const expected = money(String(settlement.expectedAmount ?? 0));
              const received = money(String(settlement.receivedAmount ?? 0));
              const variance = expected.minus(received).abs().toFixed(2);
              return (
                <button
                  type="button"
                  className={styles.settlementRow}
                  key={String(settlement.id)}
                  onClick={() => router.push('/records?tab=settlements')}
                >
                  <span>
                    <strong>{String(settlement.externalId)}</strong>
                    <small>
                      {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
                        new Date(String(settlement.settledAt)),
                      )}
                    </small>
                  </span>
                  <span className={styles.settlementAmounts}>
                    <strong>
                      <Amount value={String(settlement.receivedAmount)} />
                    </strong>
                    <small
                      className={
                        Number(variance) ? styles.settlementVariance : styles.settlementClear
                      }
                    >
                      {Number(variance) ? (
                        <>
                          Variance <Amount value={variance} />
                        </>
                      ) : (
                        'Fully settled'
                      )}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </FinoraSurface>
      </div>
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
