'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { FinancialRecordType, money } from '@finora/platform';
import {
  Amount,
  FinoraButton,
  FinoraField,
  FinoraIcon,
  FinoraIconButton,
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
  const [query, setQuery] = useState('');
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
  const visible = items.filter(
    (item) => !query || JSON.stringify(item).toLowerCase().includes(query.toLowerCase()),
  );
  const awaitingInvestigation = items.filter((item) => item.status === 'OPEN').length;
  const awaitingApproval = items.filter((item) => item.status === 'PROPOSED').length;
  const needsReview = items.filter((item) => item.status === 'NEEDS_REVIEW').length;
  return (
    <>
      <PageHeader
        title="Exceptions"
        eyebrow="CONTROLLED CLOSURE"
        description="Investigate ambiguous records, review evidence, and approve typed resolutions without modifying source data."
      />
      {error && <ErrorState message={error} />}
      <div className={styles.exceptionSummaryStrip}>
        <div>
          <strong>{items.length}</strong>
          <span>Active exceptions</span>
        </div>
        <div>
          <strong>{awaitingInvestigation}</strong>
          <span>Awaiting investigation</span>
        </div>
        <div>
          <strong>{awaitingApproval}</strong>
          <span>Approval pending</span>
        </div>
        <div>
          <strong>{needsReview}</strong>
          <span>Human review</span>
        </div>
      </div>
      <section className={`${styles.panel} ${styles.exceptionsPanel}`}>
        <div className={styles.exceptionToolbar}>
          <div>
            <h2>Review queue</h2>
            <p>Highest-value unresolved records remain visible until a decision is made.</p>
          </div>
          <label className={styles.recordSearchField}>
            <FinoraIcon name="search" />
            <FinoraInput
              className={styles.recordSearch}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search exceptions"
              aria-label="Search exceptions"
            />
          </label>
        </div>
        <div className={styles.exceptionTableHead} aria-hidden="true">
          <span>Exception</span>
          <span>Reason</span>
          <span>Variance</span>
          <span>Status</span>
          <span>Action</span>
        </div>
        <div className={styles.exceptionList}>
          {visible.map((item) => {
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
                <div className={styles.exceptionIdentity}>
                  <strong>{String(item.externalId)}</strong>
                  <span>{String(item.type).replaceAll('_', ' ')}</span>
                </div>
                <p className={styles.exceptionReason}>{String(item.reason)}</p>
                <strong className={styles.exceptionVariance}>
                  <Amount value={variance} />
                </strong>
                <div className={styles.exceptionStatus}>
                  <StatusBadge status={String(item.status)} />
                </div>
                <div className={styles.exceptionActions}>
                  {item.status === 'OPEN' ? (
                    <FinoraButton
                      size="small"
                      variant="secondary"
                      disabled={busy === item.id}
                      onClick={() =>
                        void mutate(String(item.id), `/agents/exceptions/${item.id}/investigate`)
                      }
                    >
                      {busy === item.id ? 'Investigating…' : 'Investigate'}
                    </FinoraButton>
                  ) : null}
                  {item.status === 'PROPOSED' ? (
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
                        Approve
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
                  ) : null}
                </div>
                {resolution && (
                  <div className={styles.exceptionProposal}>
                    <span>Proposed resolution</span>
                    <strong>{String(resolution.reason ?? 'Validated finance action')}</strong>
                    <small>
                      {Math.round(Number(resolution.confidence ?? 0) * 100)}% confidence · source
                      record remains unchanged
                    </small>
                  </div>
                )}
              </article>
            );
          })}
          {!visible.length ? (
            <div className={styles.recordEmptyState}>
              <FinoraIcon name="check" />
              <strong>No exceptions match this view</strong>
              <span>Clear the search to return to the active queue.</span>
            </div>
          ) : null}
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

const recordDescriptions: Record<RecordTab, string> = {
  transactions: 'Payment status, settlement linkage, and captured value',
  settlements: 'Expected funds, receipts, variance, and reconciliation outcome',
  invoices: 'Payables and receivables by counterparty, due date, and state',
  'tax-lines': 'Tax evidence, filing period, counterparty GSTIN, and match state',
  'cash-movements': 'Posted and scheduled movements across connected cash accounts',
  'expense-claims': 'Employee spend by merchant, owner, category, and approval state',
};

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
  const { data: session, status: sessionStatus } = useSession();
  const identityReady =
    process.env.NEXT_PUBLIC_AUTH_MODE !== 'keycloak' || sessionStatus === 'authenticated';
  const employeeOnly = session?.user?.role === 'EMPLOYEE';
  const visibleTabs = employeeOnly
    ? tabLabels.filter((item) => item.id === 'expense-claims')
    : tabLabels;
  const requestedTab = params.get('tab') as RecordTab | null;
  const requestedRecord = params.get('record');
  const tab = visibleTabs.some((item) => item.id === requestedTab)
    ? requestedTab!
    : employeeOnly
      ? 'expense-claims'
      : 'transactions';
  const [records, setRecords] = useState<Record<RecordTab, Data[]>>({
    transactions: [],
    settlements: [],
    invoices: [],
    'tax-lines': [],
    'cash-movements': [],
    'expense-claims': [],
  });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [drawerReady, setDrawerReady] = useState(false);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit' | 'detail'; row?: Data } | null>(
    null,
  );
  const [importResult, setImportResult] = useState<Data | null>(null);
  const loadRecords = useCallback(() => {
    setError('');
    const tabsToLoad = employeeOnly
      ? tabLabels.filter((item) => item.id === 'expense-claims')
      : tabLabels;
    return Promise.all(tabsToLoad.map((item) => request(`/finance/${item.id}`))).then((values) =>
      setRecords((current) => ({
        ...current,
        ...Object.fromEntries(tabsToLoad.map((item, index) => [item.id, values[index]])),
      })),
    );
  }, [employeeOnly]);
  useEffect(() => {
    if (!identityReady) return;
    void loadRecords().catch((reason: Error) => setError(reason.message));
  }, [identityReady, loadRecords]);
  useEffect(() => setDrawerReady(true), []);
  useEffect(() => setPage(1), [query, tab]);
  useEffect(() => {
    if (!requestedRecord || editor) return;
    const row = records[tab].find((item) => item.externalId === requestedRecord);
    if (row) setEditor({ mode: 'detail', row });
  }, [editor, records, requestedRecord, tab]);
  useEffect(() => {
    if (!editor) return;
    const bodyOverflow = document.body.style.overflow;
    const documentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditor(null);
        if (requestedRecord) router.replace(`/records?tab=${tab}`, { scroll: false });
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [editor, requestedRecord, router, tab]);
  const visible = useMemo(
    () =>
      records[tab].filter(
        (row) => !query || JSON.stringify(row).toLowerCase().includes(query.toLowerCase()),
      ),
    [query, records, tab],
  );
  const closeDrawer = () => {
    setEditor(null);
    if (requestedRecord) router.replace(`/records?tab=${tab}`, { scroll: false });
  };
  return (
    <>
      <PageHeader
        title="Records"
        description="Traceable source records across payments, settlements, invoices, tax, cash, and expenses."
        action={
          !employeeOnly ? (
            <div className={styles.rowActions}>
              <FinoraButton variant="secondary" onClick={() => setShowImport((value) => !value)}>
                {showImport ? 'Close import' : 'Import CSV'}
              </FinoraButton>
              <FinoraButton onClick={() => setEditor({ mode: 'create' })}>
                Create one record
              </FinoraButton>
            </div>
          ) : undefined
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
      {editor && drawerReady
        ? createPortal(
            <div className={styles.recordDrawerLayer}>
              <button
                className={styles.recordDrawerBackdrop}
                type="button"
                aria-label="Close record editor"
                onClick={closeDrawer}
              />
              <aside
                className={styles.recordDrawer}
                aria-label={
                  editor.mode === 'detail'
                    ? 'Financial record details'
                    : editor.mode === 'edit'
                      ? 'Edit financial record'
                      : 'Create financial record'
                }
                role="dialog"
                aria-modal="true"
              >
                {editor.mode === 'detail' && editor.row ? (
                  <RecordDetail
                    tab={tab}
                    row={editor.row}
                    onClose={closeDrawer}
                    onEdit={() => setEditor({ mode: 'edit', row: editor.row })}
                    onChanged={async () => {
                      await loadRecords();
                      closeDrawer();
                    }}
                    canReviewExpense={!employeeOnly}
                    canEdit={!employeeOnly}
                  />
                ) : (
                  <RecordEditor
                    tab={tab}
                    row={editor.row}
                    onClose={closeDrawer}
                    onSaved={async () => {
                      closeDrawer();
                      await loadRecords();
                    }}
                  />
                )}
              </aside>
            </div>,
            document.body,
          )
        : null}
      <div className={styles.recordToolbar}>
        <div className={styles.tabs}>
          {visibleTabs.map((item) => (
            <FinoraButton
              key={item.id}
              variant={tab === item.id ? 'primary' : 'ghost'}
              size="small"
              onClick={() => router.push(`/records?tab=${item.id}`)}
            >
              <span>{item.label}</span>
              <span className={styles.recordTabCount}>{records[item.id].length}</span>
            </FinoraButton>
          ))}
        </div>
        <label className={styles.recordSearchField}>
          <FinoraIcon name="search" />
          <FinoraInput
            className={styles.recordSearch}
            aria-label={`Search ${tabLabels.find((item) => item.id === tab)?.label.toLowerCase()}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${tabLabels.find((item) => item.id === tab)?.label.toLowerCase()}`}
          />
        </label>
      </div>
      {error ? (
        <ErrorState message={error} />
      ) : (
        <section className={`${styles.panel} ${styles.recordsPanel}`}>
          <div className={styles.panelHead}>
            <div>
              <h2>{tabLabels.find((item) => item.id === tab)?.label}</h2>
              <p>{recordDescriptions[tab]}</p>
            </div>
            <span className={styles.recordSummary}>
              {visible.length} {visible.length === 1 ? 'record' : 'records'}
            </span>
          </div>
          <RecordTable
            tab={tab}
            rows={visible}
            page={page}
            onPageChange={setPage}
            onView={(row) => setEditor({ mode: 'detail', row })}
            onEdit={(row) => setEditor({ mode: 'edit', row })}
            canEdit={!employeeOnly}
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
  page,
  onPageChange,
  onView,
  onEdit,
  canEdit,
}: {
  tab: RecordTab;
  rows: Data[];
  page: number;
  onPageChange: (page: number) => void;
  onView: (row: Data) => void;
  onEdit: (row: Data) => void;
  canEdit: boolean;
}) {
  const router = useRouter();
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  type RecordColumn = {
    label: string;
    width: string;
    align?: 'center';
    numeric?: boolean;
    cell: (item: Data) => React.ReactNode;
  };
  const date = (value: unknown) =>
    value
      ? new Intl.DateTimeFormat('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(String(value)))
      : null;
  const humanize = (value: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const missing = (label: string) => <span className={styles.recordMissing}>{label}</span>;
  const stacked = (primary: React.ReactNode, secondary?: React.ReactNode) => (
    <span className={styles.recordCellStack}>
      <strong>{primary}</strong>
      {secondary ? <small>{secondary}</small> : null}
    </span>
  );
  const reference = (item: Data, secondary?: React.ReactNode) =>
    stacked(String(item.externalId ?? item.name ?? 'Record'), secondary);
  const amount = (value: unknown) => <Amount value={String(value ?? '0')} />;
  const status = (item: Data, value?: unknown) => (
    <StatusBadge
      status={
        value !== undefined
          ? String(value)
          : item.matched === true
            ? 'MATCHED'
            : item.matched === false
              ? 'NEEDS_REVIEW'
              : String(item.status ?? 'PENDING')
      }
    />
  );
  const variance = (item: Data) =>
    money(String(item.expectedAmount ?? 0))
      .minus(String(item.receivedAmount ?? 0))
      .abs()
      .toFixed(2);
  const settlementResult = (item: Data) => {
    const unexplained = money(String(item.expectedAmount ?? 0))
      .minus(String(item.receivedAmount ?? 0))
      .minus(String(item.feeAmount ?? 0))
      .minus(String(item.gstAmount ?? 0))
      .minus(String(item.refundAmount ?? 0))
      .abs();
    return (
      <StatusBadge
        status={unexplained.isZero() ? 'MATCHED' : 'NEEDS_REVIEW'}
        label={unexplained.isZero() ? 'Explained' : 'Review variance'}
      />
    );
  };
  const columns: RecordColumn[] =
    tab === 'transactions'
      ? [
          {
            label: 'Payment',
            width: '20%',
            cell: (item: Data) =>
              reference(
                item,
                String((item.sourceMetadata as Data | null)?.bankReference ?? 'Imported payment'),
              ),
          },
          {
            label: 'Settlement',
            width: '18%',
            cell: (item: Data) => {
              const settlementReference = String(
                (item.settlement as Data | null)?.externalId ?? '',
              );
              return settlementReference ? (
                <button
                  className={styles.recordLink}
                  type="button"
                  onClick={() =>
                    router.push(`/records?tab=settlements&record=${settlementReference}`)
                  }
                >
                  {settlementReference} <FinoraIcon name="arrowUpRight" />
                </button>
              ) : (
                missing('Not settled')
              );
            },
          },
          {
            label: 'Occurred',
            width: '18%',
            cell: (item: Data) => date(item.occurredAt) ?? missing('Date unavailable'),
          },
          { label: 'Status', width: '18%', align: 'center', cell: status },
          {
            label: 'Amount',
            width: '18%',
            align: 'center',
            numeric: true,
            cell: (item: Data) => amount(item.amount),
          },
        ]
      : tab === 'settlements'
        ? [
            {
              label: 'Settlement',
              width: '16%',
              cell: (item: Data) => reference(item, 'Gateway settlement'),
            },
            {
              label: 'Settled',
              width: '14%',
              cell: (item: Data) => date(item.settledAt) ?? missing('Date unavailable'),
            },
            {
              label: 'Expected',
              width: '15%',
              align: 'center',
              numeric: true,
              cell: (item: Data) => amount(item.expectedAmount),
            },
            {
              label: 'Received',
              width: '15%',
              align: 'center',
              numeric: true,
              cell: (item: Data) => amount(item.receivedAmount),
            },
            {
              label: 'Variance',
              width: '14%',
              align: 'center',
              numeric: true,
              cell: (item: Data) => amount(variance(item)),
            },
            {
              label: 'Outcome',
              width: '18%',
              align: 'center',
              cell: settlementResult,
            },
          ]
        : tab === 'invoices'
          ? [
              {
                label: 'Invoice',
                width: '15%',
                cell: (item: Data) => reference(item, humanize(item.category) || 'Uncategorised'),
              },
              {
                label: 'Counterparty',
                width: '22%',
                cell: (item: Data) =>
                  item.vendor ? String(item.vendor) : missing('Counterparty not provided'),
              },
              {
                label: 'Direction',
                width: '12%',
                cell: (item: Data) => humanize(item.direction) || missing('Not classified'),
              },
              {
                label: 'Due date',
                width: '14%',
                cell: (item: Data) => date(item.dueAt) ?? missing('No due date'),
              },
              { label: 'Status', width: '14%', align: 'center', cell: status },
              {
                label: 'Amount',
                width: '15%',
                align: 'center',
                numeric: true,
                cell: (item: Data) => amount(item.amount),
              },
            ]
          : tab === 'tax-lines'
            ? [
                {
                  label: 'Tax line',
                  width: '15%',
                  cell: (item: Data) =>
                    reference(
                      item,
                      String(
                        (item.sourceMetadata as Data | null)?.invoiceReference ?? 'Tax record',
                      ),
                    ),
                },
                {
                  label: 'Tax detail',
                  width: '15%',
                  cell: (item: Data) =>
                    `${String(item.taxType ?? 'Tax')} · ${String(item.taxRate ?? 0)}%`,
                },
                {
                  label: 'Counterparty GSTIN',
                  width: '21%',
                  cell: (item: Data) =>
                    item.counterpartyTaxId
                      ? String(item.counterpartyTaxId)
                      : missing('GSTIN not provided'),
                },
                {
                  label: 'Period',
                  width: '11%',
                  cell: (item: Data) =>
                    item.taxPeriod ? String(item.taxPeriod) : missing('No tax period'),
                },
                {
                  label: 'Match status',
                  width: '16%',
                  align: 'center',
                  cell: (item: Data) => status(item, item.matchStatus),
                },
                {
                  label: 'Amount',
                  width: '14%',
                  align: 'center',
                  numeric: true,
                  cell: (item: Data) => amount(item.amount),
                },
              ]
            : tab === 'cash-movements'
              ? [
                  {
                    label: 'Movement',
                    width: '14%',
                    cell: (item: Data) =>
                      reference(item, humanize(item.sourceType) || 'Cash record'),
                  },
                  {
                    label: 'Description',
                    width: '19%',
                    cell: (item: Data) =>
                      stacked(
                        item.description
                          ? String(item.description)
                          : missing('Description unavailable'),
                        item.counterparty ? String(item.counterparty) : 'No counterparty',
                      ),
                  },
                  {
                    label: 'Category',
                    width: '13%',
                    cell: (item: Data) => humanize(item.category) || missing('Uncategorised'),
                  },
                  {
                    label: 'Account',
                    width: '13%',
                    cell: (item: Data) =>
                      String((item.account as Data | null)?.name ?? '') || missing('No account'),
                  },
                  {
                    label: 'Occurred',
                    width: '11%',
                    cell: (item: Data) => date(item.occurredAt) ?? missing('Date unavailable'),
                  },
                  { label: 'Status', width: '11%', align: 'center', cell: status },
                  {
                    label: 'Amount',
                    width: '11%',
                    align: 'center',
                    numeric: true,
                    cell: (item: Data) =>
                      stacked(
                        amount(item.amount),
                        humanize(item.direction) || 'Direction unavailable',
                      ),
                  },
                ]
              : [
                  {
                    label: 'Claim',
                    width: '13%',
                    cell: (item: Data) =>
                      reference(
                        item,
                        String((item.node as Data | null)?.name ?? 'No team assigned'),
                      ),
                  },
                  {
                    label: 'Merchant',
                    width: '15%',
                    cell: (item: Data) =>
                      item.merchant ? String(item.merchant) : missing('Merchant not provided'),
                  },
                  {
                    label: 'Employee',
                    width: '13%',
                    cell: (item: Data) =>
                      String((item.claimant as Data | null)?.name ?? '') ||
                      missing('Employee unavailable'),
                  },
                  {
                    label: 'Category',
                    width: '11%',
                    cell: (item: Data) => humanize(item.category) || missing('Uncategorised'),
                  },
                  {
                    label: 'Incurred',
                    width: '10%',
                    cell: (item: Data) => date(item.incurredAt) ?? missing('Date unavailable'),
                  },
                  {
                    label: 'Evidence',
                    width: '11%',
                    align: 'center',
                    cell: (item: Data) => {
                      const count = Array.isArray(item.documents) ? item.documents.length : 0;
                      return count ? (
                        <span className={styles.recordEvidenceReady}>
                          <FinoraIcon name="check" /> {count} attached
                        </span>
                      ) : (
                        <span className={styles.recordEvidenceMissing}>Receipt needed</span>
                      );
                    },
                  },
                  { label: 'Status', width: '9%', align: 'center', cell: status },
                  {
                    label: 'Amount',
                    width: '10%',
                    align: 'center',
                    numeric: true,
                    cell: (item: Data) => amount(item.amount),
                  },
                ];
  return (
    <div className={styles.tableWrap}>
      <table className={styles.recordTable} style={{ minWidth: columns.length > 6 ? 1120 : 980 }}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.label} style={{ width: column.width }} />
          ))}
          <col style={{ width: 92 }} />
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={column.align === 'center' ? styles.recordCenterCell : undefined}
                key={column.label}
              >
                {column.label}
              </th>
            ))}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((item, index) => (
            <tr key={String(item.id ?? item.externalId ?? index)}>
              {columns.map((column) => (
                <td
                  className={
                    column.align === 'center'
                      ? `${styles.recordCenterCell} ${column.numeric ? styles.recordAmountCell : ''}`
                      : undefined
                  }
                  key={column.label}
                >
                  {column.cell(item)}
                </td>
              ))}
              <td className={styles.recordActionCell}>
                <div className={styles.recordActions}>
                  <FinoraIconButton
                    size="small"
                    variant="ghost"
                    aria-label={`View ${String(item.externalId ?? 'record')}`}
                    title="View details"
                    onClick={() => onView(item)}
                  >
                    <FinoraIcon name="view" />
                  </FinoraIconButton>
                  {canEdit ? (
                    <FinoraIconButton
                      size="small"
                      variant="ghost"
                      aria-label={`Edit ${String(item.externalId ?? 'record')}`}
                      title="Edit record"
                      onClick={() => onEdit(item)}
                    >
                      <FinoraIcon name="edit" />
                    </FinoraIconButton>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!pageRows.length ? (
        <div className={styles.recordEmptyState}>
          <FinoraIcon name="search" />
          <strong>No records match this view</strong>
          <span>Clear the search or choose another record type.</span>
        </div>
      ) : null}
      {rows.length > pageSize ? (
        <footer className={styles.recordPagination}>
          <span>
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, rows.length)} of{' '}
            {rows.length}
          </span>
          <div>
            <FinoraButton
              size="small"
              variant="ghost"
              disabled={currentPage === 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              Previous
            </FinoraButton>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <FinoraButton
              size="small"
              variant="ghost"
              disabled={currentPage === pageCount}
              onClick={() => onPageChange(currentPage + 1)}
            >
              Next
            </FinoraButton>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

function RecordDetail({
  tab,
  row,
  onClose,
  onEdit,
  onChanged,
  canReviewExpense,
  canEdit,
}: {
  tab: RecordTab;
  row: Data;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => Promise<void>;
  canReviewExpense: boolean;
  canEdit: boolean;
}) {
  const date = (value: unknown) =>
    value
      ? new Intl.DateTimeFormat('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(String(value)))
      : '—';
  const amount = (value: unknown) => <Amount value={String(value ?? '0')} />;
  const status = (value: unknown) => <StatusBadge status={String(value ?? 'PENDING')} />;
  const settlement = (row.settlement as Data | null) ?? null;
  const summaryAmount =
    tab === 'settlements' ? row.receivedAmount : (row.amount ?? row.receivedAmount ?? '0');
  const rows =
    tab === 'transactions'
      ? [
          ['Occurred', date(row.occurredAt)],
          ['Payment status', status(row.status)],
          ['Linked settlement', String(settlement?.externalId ?? 'Not settled')],
        ]
      : tab === 'settlements'
        ? [
            ['Settled on', date(row.settledAt)],
            ['Expected', amount(row.expectedAmount)],
            ['Received', amount(row.receivedAmount)],
            ['Gateway fee', amount(row.feeAmount)],
            ['GST on fee', amount(row.gstAmount)],
            ['Refunds', amount(row.refundAmount)],
          ]
        : tab === 'invoices'
          ? [
              ['Vendor', String(row.vendor ?? '—')],
              ['Direction', String(row.direction ?? '—')],
              ['Category', String(row.category ?? '—').replaceAll('_', ' ')],
              ['Issued on', date(row.issuedAt)],
              ['Due on', date(row.dueAt)],
              ['Invoice status', status(row.status)],
              ['Organization node', String((row.node as Data | null)?.name ?? '—')],
            ]
          : tab === 'tax-lines'
            ? [
                ['Tax type', String(row.taxType ?? '—')],
                ['Tax rate', `${String(row.taxRate ?? 0)}%`],
                ['Tax period', String(row.taxPeriod ?? '—')],
                ['Counterparty tax ID', String(row.counterpartyTaxId ?? '—')],
                ['Match status', status(row.matchStatus)],
              ]
            : tab === 'cash-movements'
              ? [
                  ['Description', String(row.description ?? '—')],
                  ['Counterparty', String(row.counterparty ?? '—')],
                  ['Direction', String(row.direction ?? '—')],
                  ['Category', String(row.category ?? '—').replaceAll('_', ' ')],
                  ['Cash account', String((row.account as Data | null)?.name ?? '—')],
                  ['Occurred on', date(row.occurredAt)],
                  ['Movement status', status(row.status)],
                ]
              : [
                  ['Merchant', String(row.merchant ?? '—')],
                  ['Employee', String((row.claimant as Data | null)?.name ?? '—')],
                  ['Organization node', String((row.node as Data | null)?.name ?? '—')],
                  ['Category', String(row.category ?? '—').replaceAll('_', ' ')],
                  ['Incurred on', date(row.incurredAt)],
                  ['Claim status', status(row.status)],
                  ['Description', String(row.description ?? '—')],
                ];
  return (
    <section className={styles.recordDetail}>
      <header className={styles.recordDetailHead}>
        <div>
          <p className={styles.eyebrow}>RECORD DETAILS</p>
          <h2>{String(row.externalId ?? 'Financial record')}</h2>
          <span>{String(row.currency ?? 'INR')}</span>
        </div>
        <FinoraButton size="small" variant="ghost" onClick={onClose}>
          Close
        </FinoraButton>
      </header>
      <div className={styles.recordDetailBody}>
        <div className={styles.recordDetailAmount}>
          <span>{tab === 'settlements' ? 'Received amount' : 'Record amount'}</span>
          <strong>{amount(summaryAmount)}</strong>
        </div>
        {tab === 'transactions' && settlement ? (
          <section className={styles.recordDetailBreakdown}>
            <div>
              <span>Settlement breakdown</span>
              <strong>{String(settlement.externalId)}</strong>
            </div>
            <dl>
              <div>
                <dt>Expected</dt>
                <dd>{amount(settlement.expectedAmount)}</dd>
              </div>
              <div>
                <dt>Received</dt>
                <dd>{amount(settlement.receivedAmount)}</dd>
              </div>
              <div>
                <dt>Gateway fee</dt>
                <dd>{amount(settlement.feeAmount)}</dd>
              </div>
              <div>
                <dt>GST</dt>
                <dd>{amount(settlement.gstAmount)}</dd>
              </div>
              <div>
                <dt>Refunds</dt>
                <dd>{amount(settlement.refundAmount)}</dd>
              </div>
            </dl>
          </section>
        ) : null}
        <dl className={styles.recordDetailList}>
          {rows.map(([label, value]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {tab === 'expense-claims' ? (
          <ExpenseEvidenceWorkflow row={row} canReview={canReviewExpense} onChanged={onChanged} />
        ) : null}
      </div>
      <footer className={styles.recordDetailFooter}>
        {canEdit ? (
          <FinoraButton variant="secondary" onClick={onEdit}>
            Edit record
          </FinoraButton>
        ) : (
          <span className={styles.recordDetailReadOnly}>Employee-scoped expense record</span>
        )}
      </footer>
    </section>
  );
}

function ExpenseEvidenceWorkflow({
  row,
  canReview,
  onChanged,
}: {
  row: Data;
  canReview: boolean;
  onChanged: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('AUTO');
  const [busy, setBusy] = useState('');
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [error, setError] = useState('');
  const documents = Array.isArray(row.documents) ? (row.documents as Data[]) : [];
  const reviewable = ['SUBMITTED', 'UNDER_REVIEW'].includes(String(row.status));
  const closed = ['APPROVED', 'REJECTED', 'REIMBURSED'].includes(String(row.status));
  const uploadReceipt = async (file: File) => {
    setBusy('upload');
    setError('');
    const body = new FormData();
    body.append('file', file);
    if (category !== 'AUTO') body.append('category', category);
    try {
      await request(`/workspace/expenses/${String(row.externalId)}/receipt`, {
        method: 'POST',
        body,
      });
      await onChanged();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return (
    <section className={styles.expenseEvidence}>
      <div className={styles.expenseEvidenceHead}>
        <div>
          <span>Receipt evidence</span>
          <strong>
            {documents.length
              ? `${documents.length} ${documents.length === 1 ? 'document' : 'documents'} attached`
              : 'No receipt attached'}
          </strong>
        </div>
        <StatusBadge
          status={
            documents.length ? String(documents[0]?.status ?? 'UPLOADED') : 'RECEIPT_REQUIRED'
          }
          label={documents.length ? 'Receipt attached' : undefined}
        />
      </div>
      {documents.length ? (
        <div className={styles.expenseDocumentList}>
          {documents.map((document) => (
            <div key={String(document.id)}>
              <FinoraIcon name="records" />
              <span>
                <strong>{String(document.fileName)}</strong>
                <small>
                  {String(document.mimeType).replace('application/', '').replace('image/', '')} ·{' '}
                  {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(
                    new Date(String(document.createdAt)),
                  )}
                </small>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.expenseEvidenceCopy}>
          Attach PDF, JPEG, PNG, or WebP evidence before finance approval.
        </p>
      )}
      {!closed ? (
        <div className={styles.expenseUploadControls}>
          <FinoraSelect
            aria-label="Receipt expense category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="AUTO">Auto-detect category</option>
            {categoryOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </FinoraSelect>
          <input
            ref={fileRef}
            className={styles.expenseFileInput}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadReceipt(file);
            }}
          />
          <FinoraButton
            variant="secondary"
            disabled={busy === 'upload'}
            onClick={() => fileRef.current?.click()}
          >
            {busy === 'upload' ? 'Uploading…' : documents.length ? 'Add receipt' : 'Upload receipt'}
          </FinoraButton>
        </div>
      ) : null}
      {canReview && reviewable ? (
        <div className={styles.expenseReview}>
          {!decision ? (
            <div className={styles.expenseReviewActions}>
              <FinoraButton disabled={!documents.length} onClick={() => setDecision('APPROVE')}>
                Approve claim
              </FinoraButton>
              <FinoraButton variant="danger" onClick={() => setDecision('REJECT')}>
                Reject claim
              </FinoraButton>
            </div>
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy('review');
                setError('');
                const values = new FormData(event.currentTarget);
                try {
                  await request(`/workspace/expenses/${String(row.externalId)}/review`, {
                    method: 'POST',
                    body: JSON.stringify({
                      decision,
                      reason: values.get('reason'),
                      version: Number(row.version),
                    }),
                  });
                  await onChanged();
                } catch (reason) {
                  setError((reason as Error).message);
                } finally {
                  setBusy('');
                }
              }}
            >
              <FinoraField
                label={decision === 'APPROVE' ? 'Approval note' : 'Reason for rejection'}
              >
                <FinoraInput
                  name="reason"
                  required
                  minLength={3}
                  placeholder={
                    decision === 'APPROVE'
                      ? 'Receipt and claim details verified'
                      : 'Explain what the employee needs to correct'
                  }
                />
              </FinoraField>
              <div className={styles.expenseReviewActions}>
                <FinoraButton
                  type="submit"
                  variant={decision === 'REJECT' ? 'danger' : 'primary'}
                  disabled={busy === 'review'}
                >
                  {busy === 'review'
                    ? 'Saving decision…'
                    : decision === 'APPROVE'
                      ? 'Confirm approval'
                      : 'Confirm rejection'}
                </FinoraButton>
                <FinoraButton variant="ghost" onClick={() => setDecision(null)}>
                  Cancel
                </FinoraButton>
              </div>
            </form>
          )}
        </div>
      ) : null}
      {error ? <span className={styles.importError}>{error}</span> : null}
    </section>
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
  const invoices = Array.isArray(options.invoices) ? (options.invoices as Data[]) : [];
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
      { name: 'vendor', label: 'Counterparty', required: true },
      {
        name: 'direction',
        label: 'Direction',
        type: 'select',
        options: fixedOptions(['PAYABLE', 'RECEIVABLE']),
      },
      { name: 'category', label: 'Category', type: 'select', options: categoryOptions },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: fixedOptions(['OPEN', 'PARTIALLY_PAID', 'PARTIALLY_COLLECTED', 'PAID', 'OVERDUE']),
      },
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
      {
        name: 'invoiceId',
        label: 'Linked invoice',
        type: 'select',
        options: invoices.map((item) => ({
          value: String(item.id),
          label: `${String(item.externalId)}${item.vendor ? ` · ${String(item.vendor)}` : ''}`,
        })),
      },
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
      <div className={styles.recordEditorHead}>
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
      <div className={styles.recordEditorFooter}>
        {error ? <span className={styles.importError}>{error}</span> : null}
        <div className={styles.rowActions}>
          <FinoraButton type="submit" disabled={saving}>
            {saving ? 'Saving…' : row ? 'Save changes' : 'Create record'}
          </FinoraButton>
        </div>
      </div>
    </form>
  );
}
