'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Amount,
  FinoraButton,
  FinoraField,
  FinoraIcon,
  FinoraInput,
  FinoraSelect,
  FinoraTextarea,
  StatusBadge,
} from '@finora/ui';
import { finoraRequest } from '../lib/api';
import styles from './workspace-pages.module.css';
import { OrganizationCanvas } from './organization-canvas';

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

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
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
  if (view === 'intelligence') return <IntelligencePage />;
  if (view === 'notifications') return <NotificationsPage />;
  if (view === 'audit') return <AuditPage />;
  return <OperationsPage />;
}

function AuditPage() {
  const { data, loading, error, load } = useWorkspaceData<Json>('/audit?limit=150');
  const [tab, setTab] = useState<'events' | 'agents'>('events');
  const [query, setQuery] = useState('');
  const events = Array.isArray(data?.events) ? (data.events as Json[]) : [];
  const runs = Array.isArray(data?.agentRuns) ? (data.agentRuns as Json[]) : [];
  const visibleEvents = events.filter((event) =>
    JSON.stringify(event).toLowerCase().includes(query.toLowerCase()),
  );
  const visibleRuns = runs.filter((run) =>
    JSON.stringify(run).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Header
        eyebrow="TENANT-SCOPED CONTROL LOG"
        title="Audit"
        copy="One immutable view of record edits, approvals, organization changes, budgets, agents, imports, and system actions."
        action={
          <FinoraButton variant="secondary" onClick={() => void load()}>
            Refresh
          </FinoraButton>
        }
      />
      <AsyncState loading={loading} error={error} />
      {data && (
        <>
          <div className={styles.metricStrip}>
            <div>
              <strong>{String((data.summary as Json)?.events ?? 0)}</strong>
              <span>Audit events</span>
            </div>
            <div>
              <strong>{String((data.summary as Json)?.agentRuns ?? 0)}</strong>
              <span>Agent runs</span>
            </div>
            <div>
              <strong>{String((data.summary as Json)?.mutations ?? 0)}</strong>
              <span>Governed mutations</span>
            </div>
          </div>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.headerActions}>
                <FinoraButton
                  size="small"
                  variant={tab === 'events' ? 'primary' : 'ghost'}
                  onClick={() => setTab('events')}
                >
                  Site-wide events
                </FinoraButton>
                <FinoraButton
                  size="small"
                  variant={tab === 'agents' ? 'primary' : 'ghost'}
                  onClick={() => setTab('agents')}
                >
                  Agent runs
                </FinoraButton>
              </div>
              <FinoraInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search action, record, actor…"
              />
            </div>
            <div className={styles.auditTimeline}>
              {(tab === 'events' ? visibleEvents.length : visibleRuns.length) === 0 ? (
                <EmptyState
                  title="No matching audit activity"
                  copy="Try a broader search or switch audit views."
                />
              ) : null}
              {tab === 'events'
                ? visibleEvents.map((event) => {
                    const actor = (event.actorUser as Json | null) ?? null;
                    return (
                      <article key={String(event.id)} className={styles.auditEvent}>
                        <span className={styles.auditDot} />
                        <div>
                          <strong>{String(event.action).replaceAll('_', ' ')}</strong>
                          <p>
                            {String(event.entityType)}
                            {event.entityId ? ` · ${String(event.entityId)}` : ''}
                          </p>
                          <small>
                            {actor
                              ? `${String(actor.name)} · ${String(actor.email)}`
                              : String(event.actorType ?? 'SYSTEM')}{' '}
                            · {String(event.source ?? 'APPLICATION')}
                          </small>
                        </div>
                        <time>
                          {new Intl.DateTimeFormat('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(String(event.createdAt)))}
                        </time>
                      </article>
                    );
                  })
                : visibleRuns.map((run) => (
                    <article key={String(run.id)} className={styles.auditEvent}>
                      <span className={styles.auditDot} />
                      <div>
                        <strong>{String(run.agentType).replaceAll('_', ' ')}</strong>
                        <p>
                          {String(run.status)} · {Array.isArray(run.steps) ? run.steps.length : 0}{' '}
                          controlled steps
                        </p>
                        <small>
                          {run.skill
                            ? `Skill: ${String((run.skill as Json).name)} v${String((run.skill as Json).version)}`
                            : 'Finora controller'}
                        </small>
                      </div>
                      <time>
                        {new Intl.DateTimeFormat('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(String(run.startedAt)))}
                      </time>
                    </article>
                  ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function OrganizationPage() {
  const { data: nodes, loading, error, load } = useWorkspaceData<Json[]>('/workspace/organization');
  const [view, setView] = useState<'tree' | 'canvas'>('tree');
  const [selectedId, setSelectedId] = useState<string>();
  const [editor, setEditor] = useState<'edit' | 'add' | 'limit' | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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
  const selected = nodes?.find((node) => node.id === selectedId) ?? nodes?.[0];
  useEffect(() => {
    if (!selectedId && nodes?.length) setSelectedId(nodes[0].id);
  }, [nodes, selectedId]);
  const limits =
    nodes?.flatMap((node) => node.spendLimits ?? []).filter((limit) => limit.status === 'ACTIVE') ??
    [];
  const toggleCollapse = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <>
      <Header
        eyebrow="ORGANIZATION CONTROL"
        title="Organization & spend control"
        copy="Edit ownership, explore the hierarchy, and govern hard and category spend limits from one place."
        action={
          <div className={styles.headerActions}>
            <FinoraButton variant="secondary" onClick={() => setEditor('add')}>
              <FinoraIcon name="add" /> Add node
            </FinoraButton>
            <FinoraButton onClick={() => setEditor('limit')} disabled={!selected}>
              <FinoraIcon name="add" /> Set spend limit
            </FinoraButton>
          </div>
        }
      />
      <AsyncState loading={loading} error={error} />
      {nodes && (
        <div className={styles.metricStrip}>
          <div>
            <strong>{nodes.length}</strong>
            <span>Organization nodes</span>
          </div>
          <div>
            <strong>{limits.length}</strong>
            <span>Active hard limits</span>
          </div>
          <div>
            <strong>
              <Amount
                value={limits
                  .filter((limit) => !nodes.find((node) => node.id === limit.nodeId)?.parentId)
                  .reduce((sum, limit) => sum + Number(limit.amount), 0)
                  .toFixed(2)}
              />
            </strong>
            <span>Top-level controlled spend</span>
          </div>
        </div>
      )}
      <div className={styles.organizationLayout}>
        <section className={`${styles.panel} ${styles.hierarchyPanel}`}>
          <div className={styles.panelHead}>
            <div>
              <h2>Organization hierarchy</h2>
              <p>Select any node to edit it or manage its spend envelope.</p>
            </div>
            <div className={styles.hierarchyActions}>
              <FinoraButton
                size="small"
                variant="ghost"
                onClick={() => setCollapsed(new Set(nodes?.map((node) => node.id) ?? []))}
              >
                Collapse all
              </FinoraButton>
              <FinoraButton size="small" variant="ghost" onClick={() => setCollapsed(new Set())}>
                Expand all
              </FinoraButton>
              <div className={styles.viewSwitch}>
                <FinoraButton
                  size="small"
                  variant={view === 'tree' ? 'primary' : 'ghost'}
                  onClick={() => setView('tree')}
                >
                  Tree
                </FinoraButton>
                <FinoraButton
                  size="small"
                  variant={view === 'canvas' ? 'primary' : 'ghost'}
                  onClick={() => setView('canvas')}
                >
                  Canvas
                </FinoraButton>
              </div>
            </div>
          </div>
          {view === 'tree' ? (
            <div className={styles.tree}>
              {roots.map((node) => (
                <NodeBranch
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selected?.id}
                  collapsed={collapsed}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setEditor(null);
                  }}
                  onToggle={toggleCollapse}
                />
              ))}
            </div>
          ) : (
            <OrganizationCanvas
              nodes={nodes ?? []}
              selectedId={selected?.id}
              collapsed={collapsed}
              onSelect={(id) => {
                setSelectedId(id);
                setEditor(null);
              }}
            />
          )}
        </section>
        <aside className={styles.nodeInspector}>
          {selected ? (
            <>
              <div className={styles.inspectorHead}>
                <span className={styles.nodeGlyph}>
                  <FinoraIcon name={selected.type === 'EMPLOYEE' ? 'account' : 'organization'} />
                </span>
                <div>
                  <p>{String(selected.type).replaceAll('_', ' ')}</p>
                  <h2>{selected.name}</h2>
                  <small>{selected.code}</small>
                </div>
              </div>
              <dl className={styles.nodeFacts}>
                <div>
                  <dt>Owner</dt>
                  <dd>{selected.ownerUser?.name ?? 'Not assigned'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge status={selected.active ? 'ACTIVE' : 'DISABLED'} />
                  </dd>
                </div>
                <div>
                  <dt>Children</dt>
                  <dd>{nodes?.filter((node) => node.parentId === selected.id).length ?? 0}</dd>
                </div>
              </dl>
              <div className={styles.limitSummary}>
                <p>Active spend limit</p>
                {selected.spendLimits?.find((limit: Json) => limit.status === 'ACTIVE') ? (
                  <>
                    <strong>
                      <Amount
                        value={
                          selected.spendLimits.find((limit: Json) => limit.status === 'ACTIVE')
                            .amount
                        }
                      />
                    </strong>
                    <div>
                      {selected.spendLimits
                        .find((limit: Json) => limit.status === 'ACTIVE')
                        .categoryLimits.map((item: Json) => (
                          <span key={item.id}>
                            {String(item.category).replaceAll('_', ' ')}{' '}
                            <Amount value={item.amount} />
                          </span>
                        ))}
                    </div>
                  </>
                ) : (
                  <small>No limit configured</small>
                )}
              </div>
              <div className={styles.inspectorActions}>
                <FinoraButton variant="secondary" onClick={() => setEditor('edit')}>
                  Edit node
                </FinoraButton>
                <FinoraButton onClick={() => setEditor('limit')}>Manage limit</FinoraButton>
              </div>
            </>
          ) : (
            <p>Select a node.</p>
          )}
        </aside>
      </div>
      {editor === 'edit' && selected && (
        <NodeForm
          node={selected}
          nodes={nodes ?? []}
          onSaved={async () => {
            setEditor(null);
            await load();
          }}
        />
      )}
      {editor === 'add' && (
        <NodeForm
          parent={selected}
          nodes={nodes ?? []}
          onSaved={async (node) => {
            setEditor(null);
            setSelectedId(node.id);
            await load();
          }}
        />
      )}
      {editor === 'limit' && selected && (
        <SpendLimitForm
          node={selected}
          onSaved={async () => {
            setEditor(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function NodeBranch({
  node,
  depth,
  selectedId,
  collapsed,
  onSelect,
  onToggle,
}: {
  node: Json;
  depth: number;
  selectedId?: string;
  collapsed: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const limit = (node.spendLimits ?? []).find((item: Json) => item.status === 'ACTIVE');
  const hasChildren = Boolean(node.children?.length);
  return (
    <div className={styles.branch}>
      <article
        className={`${styles.node}${selectedId === node.id ? ` ${styles.nodeSelected}` : ''}`}
        style={{ marginLeft: `${depth * 26}px` }}
        onClick={() => onSelect(node.id)}
      >
        <FinoraButton
          className={styles.collapseButton}
          size="small"
          variant="ghost"
          disabled={!hasChildren}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.id);
          }}
        >
          {hasChildren ? (collapsed.has(node.id) ? '+' : '−') : '·'}
        </FinoraButton>
        <span className={styles.nodeGlyph}>
          <FinoraIcon name={node.type === 'EMPLOYEE' ? 'account' : 'organization'} />
        </span>
        <div className={styles.nodeIdentity}>
          <strong>{node.name}</strong>
          <span>
            {String(node.type).replaceAll('_', ' ')} · {node.code}
          </span>
        </div>
        {(node.ownerUser || node.memberUser) && (
          <div className={styles.nodeMember}>
            <span>{node.ownerUser?.name ?? node.memberUser?.name}</span>
            <small>Owner · {node.ownerUser?.email ?? node.memberUser?.email}</small>
          </div>
        )}
        {limit ? (
          <div className={styles.budget}>
            <div>
              <span>Hard spend limit</span>
              <strong>
                <Amount value={limit.amount} />
              </strong>
            </div>
            <small>{limit.categoryLimits.length} soft category limits</small>
          </div>
        ) : (
          <span className={styles.emptyBudget}>No hard limit</span>
        )}
      </article>
      {!collapsed.has(node.id) &&
        (node.children ?? []).map((child: Json) => (
          <NodeBranch
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            collapsed={collapsed}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </div>
  );
}

function NodeForm({
  node,
  parent,
  nodes,
  onSaved,
}: {
  node?: Json;
  parent?: Json;
  nodes: Json[];
  onSaved: (node: Json) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className={styles.editorPanel}
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        const values = new FormData(event.currentTarget);
        try {
          const result = await finoraRequest(
            node ? `/workspace/organization/nodes/${node.id}` : '/workspace/organization/nodes',
            {
              method: node ? 'PATCH' : 'POST',
              body: JSON.stringify({
                parentId: values.get('parentId') || (node ? null : undefined),
                name: values.get('name'),
                code: values.get('code'),
                type: values.get('type'),
                ownerUserId: values.get('ownerUserId') || (node ? null : undefined),
                ...(node ? { version: node.version, active: true } : {}),
              }),
            },
          );
          await onSaved(result as Json);
        } catch (reason) {
          setError((reason as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className={styles.editorTitle}>
        <p className={styles.eyebrow}>{node ? 'EDIT NODE' : 'NEW NODE'}</p>
        <h2>{node ? node.name : `Add under ${parent?.name ?? 'organization'}`}</h2>
      </div>
      <FinoraField label="Name">
        <FinoraInput name="name" required defaultValue={node?.name} />
      </FinoraField>
      <FinoraField label="Code">
        <FinoraInput name="code" required defaultValue={node?.code} placeholder="DEPT-SALES" />
      </FinoraField>
      <FinoraField label="Type">
        <FinoraSelect name="type" defaultValue={node?.type ?? 'TEAM'}>
          {[
            'COMPANY',
            'LEGAL_ENTITY',
            'OFFICE',
            'DEPARTMENT',
            'TEAM',
            'COST_CENTER',
            'EMPLOYEE',
          ].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </FinoraSelect>
      </FinoraField>
      <FinoraField label="Parent">
        <FinoraSelect name="parentId" defaultValue={node?.parentId ?? parent?.id ?? ''}>
          <option value="">Top level</option>
          {nodes
            .filter((item) => item.id !== node?.id)
            .map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
        </FinoraSelect>
      </FinoraField>
      <FinoraField label="Owner">
        <FinoraSelect name="ownerUserId" defaultValue={node?.ownerUserId ?? ''}>
          <option value="">Unassigned</option>
          {Array.from(
            new Map(
              nodes
                .flatMap((item) => [item.memberUser, item.ownerUser])
                .filter(Boolean)
                .map((user) => [user.id, user]),
            ).values(),
          ).map((user: Json) => (
            <option value={user.id} key={user.id}>
              {user.name}
            </option>
          ))}
        </FinoraSelect>
      </FinoraField>
      <FinoraButton type="submit" disabled={saving}>
        {saving ? 'Saving…' : node ? 'Save changes' : 'Create node'}
      </FinoraButton>
      {error && <span className={styles.inlineError}>{error}</span>}
    </form>
  );
}

const spendCategories = [
  'TRAVEL',
  'MEALS',
  'LODGING',
  'LOCAL_TRANSPORT',
  'SOFTWARE',
  'OFFICE_SUPPLIES',
  'MARKETING',
  'PROFESSIONAL_SERVICES',
  'UTILITIES',
  'VENDOR_PAYMENT',
  'OTHER',
];
function SpendLimitForm({ node, onSaved }: { node: Json; onSaved: () => Promise<void> }) {
  const current = node.spendLimits?.find((limit: Json) => limit.status === 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className={styles.editorPanel}
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        const values = new FormData(event.currentTarget);
        try {
          const categoryLimits = spendCategories
            .map((category) => ({
              category,
              amount: String(values.get(`category:${category}`) ?? ''),
            }))
            .filter((item) => item.amount);
          await finoraRequest(`/workspace/organization/nodes/${node.id}/spend-limit`, {
            method: 'POST',
            body: JSON.stringify({
              amount: values.get('amount'),
              currency: 'INR',
              periodStart: values.get('periodStart'),
              periodEnd: values.get('periodEnd'),
              status: 'ACTIVE',
              version: current?.version,
              categoryLimits,
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
      <div className={styles.editorTitle}>
        <p className={styles.eyebrow}>SPEND CONTROL</p>
        <h2>{node.name}</h2>
        <span>
          Hard limits block spend. Category limits warn the owner and finance team without hiding
          the record.
        </span>
      </div>
      <FinoraField label="Hard limit (INR)">
        <FinoraInput
          name="amount"
          required
          inputMode="decimal"
          defaultValue={current?.amount}
          placeholder="100000.00"
        />
      </FinoraField>
      <FinoraField label="Starts">
        <FinoraInput
          name="periodStart"
          required
          type="date"
          defaultValue={current?.periodStart?.slice(0, 10) ?? '2026-08-01'}
        />
      </FinoraField>
      <FinoraField label="Ends">
        <FinoraInput
          name="periodEnd"
          required
          type="date"
          defaultValue={current?.periodEnd?.slice(0, 10) ?? '2026-09-01'}
        />
      </FinoraField>
      <div className={styles.categoryLimits}>
        {spendCategories.map((category) => (
          <FinoraField key={category} label={category.replaceAll('_', ' ')}>
            <FinoraInput
              name={`category:${category}`}
              inputMode="decimal"
              defaultValue={
                current?.categoryLimits?.find((item: Json) => item.category === category)?.amount
              }
              placeholder="Optional soft limit"
            />
          </FinoraField>
        ))}
      </div>
      <FinoraButton type="submit" disabled={saving}>
        {saving ? 'Validating…' : 'Save spend controls'}
      </FinoraButton>
      {error && <span className={styles.friendlyError}>{error}</span>}
    </form>
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
      {skills.data && audit.data ? (
        <div className={styles.metricStrip}>
          <div>
            <strong>{skills.data.filter((skill) => skill.status === 'ACTIVE').length}</strong>
            <span>Active custom skills</span>
          </div>
          <div>
            <strong>{audit.data.runs.length}</strong>
            <span>Recorded agent runs</span>
          </div>
          <div>
            <strong>
              {audit.data.runs.reduce(
                (total, run) => total + (Array.isArray(run.steps) ? run.steps.length : 0),
                0,
              )}
            </strong>
            <span>Controlled tool steps</span>
          </div>
        </div>
      ) : null}
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
              {!skills.data?.length ? (
                <EmptyState
                  title="No custom skills yet"
                  copy="Create a bounded procedure with an explicit tool allowlist."
                />
              ) : null}
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
              {!audit.data?.runs.length ? (
                <EmptyState
                  title="No agent runs yet"
                  copy="Controlled model and tool activity will appear here."
                />
              ) : null}
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
          {!audit.data?.auditEvents.length ? (
            <EmptyState
              title="No financial activity yet"
              copy="Audited changes will appear here."
            />
          ) : null}
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
      <FinoraField label="Name">
        <FinoraInput name="name" minLength={3} required placeholder="Month-end variance review" />
      </FinoraField>
      <FinoraField label="Description">
        <FinoraInput
          name="description"
          minLength={10}
          required
          placeholder="Investigates unexplained settlement variances"
        />
      </FinoraField>
      <div className={styles.wide}>
        <FinoraField label="Instructions">
          <FinoraTextarea
            name="instructions"
            minLength={20}
            required
            rows={3}
            placeholder="When a settlement has an unexplained variance, gather its evidence…"
          />
        </FinoraField>
      </div>
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
  const router = useRouter();
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
          {!notifications.data?.length ? (
            <EmptyState title="You're all caught up" copy="New finance alerts will appear here." />
          ) : null}
          {notifications.data?.map((item) => (
            <article
              className={item.status === 'READ' ? styles.notificationRead : ''}
              key={item.id}
            >
              <span className={styles.notificationState} aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <small>
                  {item.channel} · {new Date(item.createdAt).toLocaleString('en-IN')}
                </small>
              </div>
              <div className={styles.notificationActions}>
                {item.actionUrl ? (
                  <FinoraButton
                    variant="secondary"
                    size="small"
                    onClick={() => router.push(String(item.actionUrl))}
                  >
                    Open
                  </FinoraButton>
                ) : null}
                {item.status !== 'READ' ? (
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
                ) : null}
              </div>
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
      {operations.data ? (
        <div className={styles.metricStrip}>
          <div>
            <strong>
              {operations.data.integrations.filter((item) => item.status === 'CONNECTED').length}
            </strong>
            <span>Connected sources</span>
          </div>
          <div>
            <strong>
              {operations.data.jobs.filter((item) => item.status === 'ACTIVE').length}
            </strong>
            <span>Active automation jobs</span>
          </div>
          <div>
            <strong>{operations.data.policies.filter((item) => !item.autoApprove).length}</strong>
            <span>Human-controlled policies</span>
          </div>
        </div>
      ) : null}
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
