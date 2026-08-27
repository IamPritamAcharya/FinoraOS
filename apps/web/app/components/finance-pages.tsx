'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { money } from '@finora/platform';
import { Amount, FinoraButton, StatusBadge } from '@finora/ui';
import styles from '../workspace.module.css';
import { finoraRequest as request } from '../lib/api';

type Data = Record<string, unknown>;
type FinanceView = 'overview' | 'records' | 'reconciliation' | 'exceptions';
type RecordTab = 'transactions' | 'settlements' | 'invoices' | 'tax-lines' | 'cash-movements';
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
];

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
  });
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void Promise.all(tabLabels.map((item) => request(`/finance/${item.id}`)))
      .then((values) =>
        setRecords(
          Object.fromEntries(tabLabels.map((item, index) => [item.id, values[index]])) as Record<
            RecordTab,
            Data[]
          >,
        ),
      )
      .catch((reason: Error) => setError(reason.message));
  }, []);
  const visible = useMemo(
    () =>
      records[tab].filter(
        (row) => !query || JSON.stringify(row).toLowerCase().includes(query.toLowerCase()),
      ),
    [query, records, tab],
  );
  return (
    <>
      <PageHeader title="Records" />
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
          <RecordTable tab={tab} rows={visible} />
        </section>
      )}
    </>
  );
}

function RecordTable({ tab, rows }: { tab: RecordTab; rows: Data[] }) {
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
