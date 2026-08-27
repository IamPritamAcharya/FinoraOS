'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Amount, FinoraButton, FinoraIcon, StatusBadge } from '@finora/ui';
import { finoraRequest } from '../lib/api';
import styles from './workspace-pages.module.css';

type Json = Record<string, any>;
const availableSkillTools = [
  'getOrganizationSummary',
  'getBudgetSummary',
  'getPaymentSummary',
  'getSettlementSummary',
  'getInvoiceSummary',
  'getTaxSummary',
  'getExpenseSummary',
  'findTransactions',
  'findSettlements',
  'findInvoices',
  'getSettlement',
  'getException',
  'getExceptionEvidence',
  'getCashForecast',
  'findUnmatchedTaxLines',
] as const;

function Header({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{copy}</span>
      </div>
      {action}
    </header>
  );
}

function AsyncState({ loading, error }: { loading: boolean; error: string }) {
  if (error)
    return (
      <div className={styles.error}>
        <strong>Unable to load this workspace.</strong>
        <span>{error}</span>
      </div>
    );
  if (loading)
    return (
      <div className={styles.loading}>
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    );
  return null;
}

function useWorkspaceData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData((await finoraRequest(path)) as T);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, error, load };
}

export function WorkspacePage({ view }: { view: string }) {
  if (view === 'organization') return <OrganizationPage />;
  if (view === 'expenses') return <ExpensesPage />;
  if (view === 'intelligence') return <IntelligencePage />;
  if (view === 'notifications') return <NotificationsPage />;
  return <OperationsPage />;
}

function OrganizationPage() {
  const { data: nodes, loading, error, load } = useWorkspaceData<Json[]>('/workspace/organization');
  const [showBudget, setShowBudget] = useState(false);
  const roots = useMemo(() => {
    if (!nodes) return [];
    const byParent = new Map<string | null, Json[]>();
    nodes.forEach((node) => {
      const key = node.parentId ?? null;
      byParent.set(key, [...(byParent.get(key) ?? []), node]);
    });
    const attach = (node: Json): Json => ({
      ...node,
      children: (byParent.get(node.id) ?? []).map(attach),
    });
    return (byParent.get(null) ?? []).map(attach);
  }, [nodes]);
  const activeBudgets =
    nodes?.flatMap((node) => node.budgets ?? []).filter((budget) => budget.status === 'ACTIVE') ??
    [];
  return (
    <>
      <Header
        eyebrow="ORGANIZATION CONTROL"
        title="Nodes & budgets"
        copy="Model how money ownership flows across entities, offices, departments, teams and people."
        action={
          <FinoraButton onClick={() => setShowBudget((value) => !value)}>
            <FinoraIcon name="add" /> Set budget
          </FinoraButton>
        }
      />
      <AsyncState loading={loading} error={error} />
      {showBudget && (
        <BudgetForm
          nodes={nodes ?? []}
          onSaved={async () => {
            setShowBudget(false);
            await load();
          }}
        />
      )}
      {nodes && (
        <div className={styles.metricStrip}>
          <div>
            <strong>{nodes.length}</strong>
            <span>Organization nodes</span>
          </div>
          <div>
            <strong>{activeBudgets.length}</strong>
            <span>Active budgets</span>
          </div>
          <div>
            <strong>
              <Amount
                value={activeBudgets
                  .reduce((sum, budget) => sum + Number(budget.amount), 0)
                  .toFixed(2)}
              />
            </strong>
            <span>Allocated this period</span>
          </div>
        </div>
      )}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>Organization hierarchy</h2>
            <p>Budgets roll up through the node tree without changing raw finance records.</p>
          </div>
        </div>
        <div className={styles.tree}>
          {roots.map((node) => (
            <NodeBranch key={node.id} node={node} depth={0} />
          ))}
        </div>
      </section>
    </>
  );
}

function NodeBranch({ node, depth }: { node: Json; depth: number }) {
  const budget = (node.budgets ?? []).find((item: Json) => item.status === 'ACTIVE');
  const utilization = budget
    ? Math.min(100, (Number(budget.committedAmount) / Number(budget.amount)) * 100)
    : 0;
  return (
    <div className={styles.branch}>
      <article className={styles.node} style={{ marginLeft: `${depth * 26}px` }}>
        <span className={styles.nodeGlyph}>
          <FinoraIcon name={node.type === 'EMPLOYEE' ? 'account' : 'organization'} />
        </span>
        <div className={styles.nodeIdentity}>
          <strong>{node.name}</strong>
          <span>
            {String(node.type).replaceAll('_', ' ')} · {node.code}
          </span>
        </div>
        {node.memberUser && (
          <div className={styles.nodeMember}>
            <span>{node.memberUser.email}</span>
            <small>{String(node.memberUser.role).replaceAll('_', ' ')}</small>
          </div>
        )}
        {budget ? (
          <div className={styles.budget}>
            <div>
              <span>{budget.name}</span>
              <strong>
                <Amount value={budget.amount} />
              </strong>
            </div>
            <div className={styles.progress}>
              <i style={{ width: `${utilization}%` }} />
            </div>
            <small>
              <Amount value={budget.committedAmount} /> committed · {utilization.toFixed(0)}%
            </small>
          </div>
        ) : (
          <span className={styles.emptyBudget}>No active budget</span>
        )}
      </article>
      {(node.children ?? []).map((child: Json) => (
        <NodeBranch key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function BudgetForm({ nodes, onSaved }: { nodes: Json[]; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className={styles.formPanel}
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        const values = new FormData(event.currentTarget);
        try {
          await finoraRequest('/workspace/budgets', {
            method: 'POST',
            body: JSON.stringify({
              nodeId: values.get('nodeId'),
              name: values.get('name'),
              amount: values.get('amount'),
              currency: 'INR',
              periodStart: values.get('periodStart'),
              periodEnd: values.get('periodEnd'),
              status: 'ACTIVE',
            }),
          });
          await onSaved();
        } catch (reason) {
          setError((reason as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div>
        <p className={styles.eyebrow}>NEW ALLOCATION</p>
        <h2>Set a node budget</h2>
      </div>
      <label>
        Node
        <select name="nodeId" required defaultValue="">
          <option value="" disabled>
            Select a node
          </option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.name} · {node.code}
            </option>
          ))}
        </select>
      </label>
      <label>
        Budget name
        <input name="name" required minLength={3} placeholder="August operating budget" />
      </label>
      <label>
        Amount (INR)
        <input
          name="amount"
          required
          inputMode="decimal"
          pattern="\d+(\.\d{1,2})?"
          placeholder="1200000.00"
        />
      </label>
      <label>
        Starts
        <input name="periodStart" required type="date" />
      </label>
      <label>
        Ends
        <input name="periodEnd" required type="date" />
      </label>
      <FinoraButton type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Create budget'}
      </FinoraButton>
      {error && <span className={styles.inlineError}>{error}</span>}
    </form>
  );
}

function ExpensesPage() {
  const { data: expenses, loading, error, load } = useWorkspaceData<Json[]>('/workspace/expenses');
  return (
    <>
      <Header
        eyebrow="EMPLOYEE OPERATIONS"
        title="Expenses & receipts"
        copy="A single queue for employee evidence, finance review and reimbursement readiness."
      />
      <AsyncState loading={loading} error={error} />
      {expenses && (
        <div className={styles.metricStrip}>
          <div>
            <strong>{expenses.length}</strong>
            <span>Visible claims</span>
          </div>
          <div>
            <strong>{expenses.filter((item) => item.status === 'RECEIPT_REQUIRED').length}</strong>
            <span>Receipts missing</span>
          </div>
          <div>
            <strong>
              <Amount
                value={expenses.reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2)}
              />
            </strong>
            <span>Total value</span>
          </div>
        </div>
      )}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>Expense evidence queue</h2>
            <p>Employee access is automatically limited to their own claims.</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Claim</th>
                <th>Employee</th>
                <th>Merchant</th>
                <th>Node / budget</th>
                <th>Evidence</th>
                <th>Status</th>
                <th className={styles.numeric}>Amount</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {expenses?.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <strong>{expense.externalId}</strong>
                    <small>{new Date(expense.incurredAt).toLocaleDateString('en-IN')}</small>
                  </td>
                  <td>
                    {expense.claimant.name}
                    <small>{expense.claimant.email}</small>
                  </td>
                  <td>
                    {expense.merchant}
                    <small>{String(expense.category).replaceAll('_', ' ')}</small>
                  </td>
                  <td>
                    {expense.node.name}
                    <small>{expense.budget?.name ?? 'Unallocated'}</small>
                  </td>
                  <td>
                    {expense.documents.length ? (
                      <span className={styles.evidenceOk}>
                        <FinoraIcon name="check" /> {expense.documents.length} attached
                      </span>
                    ) : (
                      <span className={styles.evidenceMissing}>Receipt required</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={expense.status} />
                  </td>
                  <td className={styles.numeric}>
                    <Amount value={expense.amount} />
                  </td>
                  <td>
                    <ReceiptUpload expenseId={expense.externalId} onUploaded={load} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ReceiptUpload({
  expenseId,
  onUploaded,
}: {
  expenseId: string;
  onUploaded: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  return (
    <label className={styles.uploadButton}>
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        disabled={uploading}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setUploading(true);
          setError('');
          const body = new FormData();
          body.append('file', file);
          try {
            await finoraRequest(`/workspace/expenses/${expenseId}/receipt`, {
              method: 'POST',
              body,
            });
            await onUploaded();
          } catch (reason) {
            setError((reason as Error).message);
          } finally {
            setUploading(false);
            event.target.value = '';
          }
        }}
      />
      <span>{uploading ? 'Uploading…' : 'Upload receipt'}</span>
      {error && <small title={error}>Failed</small>}
    </label>
  );
}

function IntelligencePage() {
  const skills = useWorkspaceData<Json[]>('/workspace/skills');
  const audit = useWorkspaceData<{ runs: Json[]; auditEvents: Json[] }>('/workspace/agent-audit');
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Header
        eyebrow="CONTROLLED INTELLIGENCE"
        title="Agent control"
        copy="Define reusable finance procedures and inspect every model, tool and human action."
        action={
          <FinoraButton onClick={() => setCreating((value) => !value)}>
            <FinoraIcon name="add" /> Create skill
          </FinoraButton>
        }
      />
      {skills.error || audit.error ? (
        <AsyncState loading={false} error={skills.error || audit.error} />
      ) : null}
      {creating && (
        <SkillForm
          onSaved={async () => {
            setCreating(false);
            await skills.load();
          }}
        />
      )}
      <div className={styles.twoColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Custom skills</h2>
              <p>Instructions are bounded by an explicit tool allowlist.</p>
            </div>
            <span className={styles.count}>{skills.data?.length ?? 0}</span>
          </div>
          {skills.loading ? (
            <AsyncState loading error="" />
          ) : (
            <div className={styles.cardList}>
              {skills.data?.map((skill) => (
                <article className={styles.skillCard} key={skill.id}>
                  <div>
                    <strong>{skill.name}</strong>
                    <span>
                      v{skill.version} · {skill.createdBy.name}
                    </span>
                  </div>
                  <StatusBadge status={skill.status} />
                  <p>{skill.description}</p>
                  <div className={styles.toolList}>
                    {skill.allowedTools.map((tool: string) => (
                      <code key={tool}>{tool}</code>
                    ))}
                  </div>
                  <div className={styles.cardFooter}>
                    <span>{skill._count.agentRuns} runs</span>
                    {skill.status !== 'ACTIVE' && (
                      <FinoraButton
                        size="small"
                        variant="secondary"
                        onClick={async () => {
                          await finoraRequest(`/workspace/skills/${skill.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'ACTIVE' }),
                          });
                          await skills.load();
                        }}
                      >
                        Activate
                      </FinoraButton>
                    )}
                    {skill.status === 'ACTIVE' && (
                      <FinoraButton
                        size="small"
                        variant="ghost"
                        onClick={async () => {
                          await finoraRequest(`/workspace/skills/${skill.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'DISABLED' }),
                          });
                          await skills.load();
                        }}
                      >
                        Disable
                      </FinoraButton>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Agent audit</h2>
              <p>Latest model runs and controlled tool activity.</p>
            </div>
            <span className={styles.count}>{audit.data?.runs.length ?? 0}</span>
          </div>
          {audit.loading ? (
            <AsyncState loading error="" />
          ) : (
            <div className={styles.timeline}>
              {audit.data?.runs.map((run) => (
                <article key={run.id}>
                  <i
                    className={run.status === 'COMPLETED' ? styles.timelineOk : styles.timelineWarn}
                  />
                  <div>
                    <div className={styles.timelineTitle}>
                      <strong>{String(run.agentType).replaceAll('_', ' ')}</strong>
                      <StatusBadge status={run.status} />
                    </div>
                    <span>
                      {new Date(run.startedAt).toLocaleString('en-IN')}
                      {run.input?.gateway
                        ? ` · ${run.input.gateway.provider}/${run.input.gateway.model}`
                        : ''}
                    </span>
                    {run.skill && (
                      <small>
                        Skill: {run.skill.name} v{run.skill.version}
                      </small>
                    )}
                    <div className={styles.steps}>
                      {run.steps.map((step: Json) => (
                        <span key={step.id}>{step.label}</span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>Financial audit trail</h2>
            <p>Mutations, approvals and automation events across this tenant.</p>
          </div>
        </div>
        <div className={styles.auditGrid}>
          {audit.data?.auditEvents.map((event) => (
            <article key={event.id}>
              <div>
                <strong>{String(event.action).replaceAll('_', ' ')}</strong>
                <span>
                  {event.entityType} · {event.entityId}
                </span>
              </div>
              <time>{new Date(event.createdAt).toLocaleString('en-IN')}</time>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function SkillForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className={styles.formPanel}
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        const values = new FormData(event.currentTarget);
        try {
          await finoraRequest('/workspace/skills', {
            method: 'POST',
            body: JSON.stringify({
              name: values.get('name'),
              description: values.get('description'),
              instructions: values.get('instructions'),
              allowedTools: values.getAll('allowedTools'),
            }),
          });
          await onSaved();
        } catch (reason) {
          setError((reason as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div>
        <p className={styles.eyebrow}>CUSTOM PROCEDURE</p>
        <h2>Create an agent skill</h2>
      </div>
      <label>
        Name
        <input name="name" minLength={3} required placeholder="Month-end variance review" />
      </label>
      <label>
        Description
        <input
          name="description"
          minLength={10}
          required
          placeholder="Investigates unexplained settlement variances"
        />
      </label>
      <label className={styles.wide}>
        Instructions
        <textarea
          name="instructions"
          minLength={20}
          required
          rows={3}
          placeholder="When a settlement has an unexplained variance, gather its evidence…"
        />
      </label>
      <fieldset className={styles.wide}>
        <legend>Allowed tools</legend>
        <div className={styles.checkboxGrid}>
          {availableSkillTools.map((tool) => (
            <label key={tool}>
              <input type="checkbox" name="allowedTools" value={tool} /> {tool}
            </label>
          ))}
        </div>
      </fieldset>
      <FinoraButton type="submit" disabled={saving}>
        {saving ? 'Creating…' : 'Create draft skill'}
      </FinoraButton>
      {error && <span className={styles.inlineError}>{error}</span>}
    </form>
  );
}

function NotificationsPage() {
  const notifications = useWorkspaceData<Json[]>('/workspace/notifications');
  const unread = notifications.data?.filter((item) => item.status !== 'READ').length ?? 0;
  return (
    <>
      <Header
        eyebrow="PERSONAL INBOX"
        title="Notifications"
        copy="Receipt requests, approvals, reconciliation alerts and automation outcomes for you."
      />
      <AsyncState loading={notifications.loading} error={notifications.error} />
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2>Inbox</h2>
            <p>
              {unread} unread notification{unread === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className={styles.notificationList}>
          {notifications.data?.map((item) => (
            <article
              className={item.status === 'READ' ? styles.notificationRead : ''}
              key={item.id}
            >
              <span className={styles.notificationIcon}>
                <FinoraIcon name="notifications" />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <small>
                  {item.channel} · {new Date(item.createdAt).toLocaleString('en-IN')}
                </small>
              </div>
              {item.status !== 'READ' && (
                <FinoraButton
                  variant="ghost"
                  size="small"
                  onClick={async () => {
                    await finoraRequest(`/workspace/notifications/${item.id}/read`, {
                      method: 'POST',
                    });
                    await notifications.load();
                  }}
                >
                  Mark read
                </FinoraButton>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function OperationsPage() {
  const operations = useWorkspaceData<{ integrations: Json[]; jobs: Json[]; policies: Json[] }>(
    '/workspace/operations',
  );
  const [running, setRunning] = useState('');
  return (
    <>
      <Header
        eyebrow="FINANCE INFRASTRUCTURE"
        title="Operations"
        copy="Connections, scheduled finance jobs and human approval boundaries in one control plane."
      />
      <AsyncState loading={operations.loading} error={operations.error} />
      {operations.data && (
        <div className={styles.twoColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>Connections</h2>
                <p>Credentials are referenced externally and never returned here.</p>
              </div>
            </div>
            <div className={styles.connectionGrid}>
              {operations.data.integrations.map((connection) => (
                <article key={connection.id}>
                  <span className={styles.connectionIcon}>
                    <FinoraIcon name="operations" />
                  </span>
                  <div>
                    <strong>{connection.displayName}</strong>
                    <span>
                      {connection.provider} · {connection.type}
                    </span>
                  </div>
                  <StatusBadge status={connection.status} />
                </article>
              ))}
            </div>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2>Automation jobs</h2>
                <p>Scheduled work remains bounded by policy and audit.</p>
              </div>
            </div>
            <div className={styles.cardList}>
              {operations.data.jobs.map((job) => (
                <article className={styles.jobCard} key={job.id}>
                  <div>
                    <strong>{job.name}</strong>
                    <span>{String(job.type).replaceAll('_', ' ')}</span>
                  </div>
                  <StatusBadge status={job.status} />
                  <p>{job.cronExpression ?? 'Manual trigger'}</p>
                  {job.type === 'RECEIPT_REMINDER' && (
                    <FinoraButton
                      size="small"
                      variant="secondary"
                      disabled={running === job.id}
                      onClick={async () => {
                        setRunning(job.id);
                        try {
                          await finoraRequest(`/workspace/jobs/${job.id}/run`, { method: 'POST' });
                          await operations.load();
                        } finally {
                          setRunning('');
                        }
                      }}
                    >
                      {running === job.id ? 'Running…' : 'Run now'}
                    </FinoraButton>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {operations.data && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Approval policies</h2>
              <p>Autonomous closure is disabled unless an explicit policy allows it.</p>
            </div>
          </div>
          <div className={styles.policyGrid}>
            {operations.data.policies.map((policy) => (
              <article key={policy.id}>
                <div>
                  <strong>{policy.name}</strong>
                  <span>{String(policy.actionType).replaceAll('_', ' ')}</span>
                </div>
                <dl>
                  <div>
                    <dt>Scope</dt>
                    <dd>{policy.node?.name ?? 'Organization'}</dd>
                  </div>
                  <div>
                    <dt>Amount limit</dt>
                    <dd>
                      {policy.amountLimit ? <Amount value={policy.amountLimit} /> : 'No limit'}
                    </dd>
                  </div>
                  <div>
                    <dt>Minimum confidence</dt>
                    <dd>
                      {policy.minimumConfidence
                        ? `${Number(policy.minimumConfidence) * 100}%`
                        : 'Human only'}
                    </dd>
                  </div>
                  <div>
                    <dt>Auto approve</dt>
                    <dd>{policy.autoApprove ? 'Enabled' : 'Disabled'}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
