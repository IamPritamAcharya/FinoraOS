'use client';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Amount, FinoraButton, StatusBadge } from '@finora/ui';
import { AppSidebar, type WorkspaceView } from './components/app-sidebar';
import { FinoraChat } from './components/finora-chat';
import styles from './workspace.module.css';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
type Data = Record<string, any>;
type WorkspaceData = {
  overview: Data;
  exceptions: Data[];
  transactions: Data[];
  settlements: Data[];
  run: Data;
};
let workspaceCache: WorkspaceData | null = null;
const pathFor = (page: WorkspaceView) => (page === 'Chat' ? '/' : `/${page.toLowerCase()}`);
const pageFor = (pathname: string): WorkspaceView =>
  (
    ({
      '/overview': 'Overview',
      '/records': 'Records',
      '/reconciliation': 'Reconciliation',
      '/exceptions': 'Exceptions',
    }) as Record<string, WorkspaceView>
  )[pathname] ?? 'Chat';
const get = async (path: string) => {
  const response = await fetch(`${api}${path}`);
  if (!response.ok)
    throw new Error('FinoraOS API is unavailable. Start the API and database, then refresh.');
  return response.json();
};

export default function Workspace() {
  const pathname = usePathname();
  const router = useRouter();
  const page = pageFor(pathname);
  const [overview, setOverview] = useState<Data | null>(null);
  const [exceptions, setExceptions] = useState<Data[]>([]);
  const [transactions, setTransactions] = useState<Data[]>([]);
  const [settlements, setSettlements] = useState<Data[]>([]);
  const [run, setRun] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (workspaceCache) {
      setOverview(workspaceCache.overview);
      setExceptions(workspaceCache.exceptions);
      setTransactions(workspaceCache.transactions);
      setSettlements(workspaceCache.settlements);
      setRun(workspaceCache.run);
      return;
    }
    Promise.all([
      get('/finance/overview'),
      get('/reconciliation/exceptions'),
      get('/finance/transactions'),
      get('/finance/settlements'),
      get('/reconciliation/runs/latest'),
    ])
      .then(([o, e, t, s, r]) => {
        workspaceCache = { overview: o, exceptions: e, transactions: t, settlements: s, run: r };
        setOverview(o);
        setExceptions(e);
        setTransactions(t);
        setSettlements(s);
        setRun(r);
      })
      .catch((err: Error) => setError(err.message));
  }, []);
  const navigate = (nextPage: WorkspaceView) => router.push(pathFor(nextPage));
  const cards = useMemo(
    () =>
      overview
        ? [
            { label: 'Current cash position', value: overview.cashPosition, money: true },
            { label: 'Records processed', value: overview.recordsProcessed },
            { label: 'Open exceptions', value: overview.openExceptions },
            { label: 'Resolved by agent', value: overview.agentResolved },
          ]
        : [],
    [overview],
  );
  const open = exceptions.filter((item) => item.status !== 'RESOLVED');
  const investigate = async (id: string) => {
    const response = await fetch(`${api}/agents/exceptions/${id}/investigate`, { method: 'POST' });
    if (response.ok) {
      const result = await response.json();
      setExceptions((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: result.status, resolution: result } : item,
        ),
      );
    }
  };
  return (
    <main className={styles.shell}>
      <AppSidebar activeView={page} onNavigate={navigate} />
      <section
        className={page === 'Chat' ? `${styles.content} ${styles.contentChat}` : styles.content}
        key={page}
      >
        {page !== 'Chat' && (
          <header className={styles.pageHeader}>
            <div>
              <p className={styles.eyebrow}>FINANCE OPERATIONS</p>
              <h1>{page}</h1>
            </div>
            <div className={styles.profile}>AM</div>
          </header>
        )}
        {error ? (
          <div className={styles.error}>
            <strong>Connection needed.</strong> {error}
            <code>pnpm infra:up && pnpm db:migrate && pnpm seed && pnpm dev</code>
          </div>
        ) : page === 'Overview' ? (
          <Overview cards={cards} run={run} open={open} setPage={navigate} />
        ) : page === 'Chat' ? (
          <FinoraChat settlements={settlements} onViewSettlement={() => navigate('Records')} />
        ) : page === 'Records' ? (
          <Records items={transactions} />
        ) : page === 'Reconciliation' ? (
          <Reconciliation run={run} />
        ) : (
          <Exceptions items={exceptions} investigate={investigate} />
        )}
      </section>
    </main>
  );
}

function Overview({
  cards,
  run,
  open,
  setPage,
}: {
  cards: Data[];
  run: Data | null;
  open: Data[];
  setPage: (page: WorkspaceView) => void;
}) {
  return (
    <>
      <div className={styles.metrics}>
        {cards.map((card) => (
          <article className={styles.metric} key={card.label}>
            <p>{card.label}</p>
            <strong>{card.money ? <Amount value={card.value} /> : card.value}</strong>
            <span>
              {card.label === 'Open exceptions' ? 'Needs attention' : 'From seeded finance data'}
            </span>
          </article>
        ))}
      </div>
      <div className={styles.twoCol}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Reconciliation health</h2>
              <p>Latest deterministic matching run</p>
            </div>
            <StatusBadge status="MATCHED" />
          </div>
          {run && (
            <div className="health">
              <Metric label="Deterministic matches" value={run.deterministicMatches} />
              <Metric label="Agent-resolved" value={run.agentResolved} />
              <Metric label="Needs review" value={run.needsReview} />
              <Metric label="Unresolved" value={run.unresolved} />
            </div>
          )}
          <FinoraButton
            className={styles.textButton}
            variant="ghost"
            size="small"
            onClick={() => setPage('Reconciliation')}
          >
            View reconciliation run →
          </FinoraButton>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Priority exceptions</h2>
              <p>{open.length} exceptions require action</p>
            </div>
            <FinoraButton
              className={styles.textButton}
              variant="ghost"
              size="small"
              onClick={() => setPage('Exceptions')}
            >
              View all →
            </FinoraButton>
          </div>
          {open.slice(0, 3).map((item) => (
            <div className={styles.miniRow} key={item.id}>
              <div>
                <strong>{item.externalId}</strong>
                <span>{item.type.replaceAll('_', ' ')}</span>
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.runMetric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function Reconciliation({ run }: { run: Data | null }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>LATEST RUN</p>
          <h2>Deterministic reconciliation</h2>
        </div>
        <StatusBadge status="MATCHED" />
      </div>
      {run && (
        <div className={styles.runGrid}>
          <Metric label="Records processed" value={run.recordsProcessed} />
          <Metric label="Deterministic matches" value={run.deterministicMatches} />
          <Metric label="Exceptions" value={run.exceptionsGenerated} />
          <Metric
            label="Auto-close rate"
            value={`${(((run.deterministicMatches + run.agentResolved) / run.recordsProcessed) * 100).toFixed(1)}%`}
          />
        </div>
      )}
      <p className={styles.muted}>
        Exact identifiers, amounts, settlement relationships, and date windows are reconciled
        deterministically. Only ambiguous cases enter the agent workflow.
      </p>
    </section>
  );
}
function Exceptions({ items, investigate }: { items: Data[]; investigate: (id: string) => void }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>EXCEPTION QUEUE</p>
          <h2>Investigate and close safely</h2>
        </div>
        <span className={styles.count}>{items.length}</span>
      </div>
      <Table>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.externalId}</strong>
              <small>{item.reason}</small>
            </td>
            <td>{item.type.replaceAll('_', ' ')}</td>
            <td>
              <Amount value={String(Number(item.expectedAmount) - Number(item.receivedAmount))} />
            </td>
            <td>
              <StatusBadge status={item.status} />
            </td>
            <td>
              {item.status === 'OPEN' ? (
                <FinoraButton
                  className={styles.smallButton}
                  variant="secondary"
                  size="small"
                  onClick={() => investigate(item.id)}
                >
                  Investigate
                </FinoraButton>
              ) : (
                <span className={styles.muted}>
                  {item.resolution ? 'Proposed' : 'Evidence pending'}
                </span>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </section>
  );
}
function Records({ items }: { items: Data[] }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>PAYMENTS</p>
          <h2>Financial records</h2>
        </div>
        <span className={styles.count}>{items.length}</span>
      </div>
      <Table>
        {items.slice(0, 24).map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.externalId}</strong>
              <small>Mock Razorpay · traceable source</small>
            </td>
            <td>{new Date(item.occurredAt).toLocaleDateString('en-IN')}</td>
            <td>{item.settlementId?.replace('settlement-', 'STL_')}</td>
            <td>
              <StatusBadge status={item.status === 'CAPTURED' ? 'MATCHED' : 'NEEDS_REVIEW'} />
            </td>
            <td>
              <Amount value={item.amount} />
            </td>
          </tr>
        ))}
      </Table>
    </section>
  );
}
function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Type / date</th>
            <th>Amount / settlement</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
