'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FinoraArtifact, FinoraChatPayload } from '@finora/platform';
import { Amount, FinoraButton, FinoraIcon, FinoraIconButton, StatusBadge } from '@finora/ui';
import styles from './finora-chat.module.css';

type Data = Record<string, unknown>;
type FinoraUIMessage = UIMessage<unknown, { finora: FinoraChatPayload }>;
type ThreadSummary = { id: string; title: string; createdAt: string; updatedAt: string };
type PersistedMessage = { id: string; role: string; content: string; payload?: Data | null };
type PersistedThread = ThreadSummary & { messages: PersistedMessage[] };

const activeChatThreadKey = 'finora-active-chat-thread';
const suggestions = [
  {
    title: 'Ask about your finances',
    prompt: 'Summarise our expenses this month and tell me the largest category.',
    detail: 'Analyse records across tools',
  },
  {
    title: 'Investigate an exception',
    prompt: 'Investigate EXC_005 and show me the evidence.',
    detail: 'Create a controlled proposal',
  },
  {
    title: 'Find a cash risk',
    prompt: 'What is our expected cash position this week?',
    detail: 'Review scheduled movements',
  },
];

const messageText = (message: Pick<FinoraUIMessage, 'parts'>) =>
  message.parts
    .filter(
      (part): part is Extract<(typeof message.parts)[number], { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.text)
    .join('');

const messagePayload = (message: FinoraUIMessage) =>
  message.parts.find((part) => part.type === 'data-finora')?.data;

const valueRecord = (value: unknown): Data =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : {};

const persistedToUiMessage = (threadId: string, message: PersistedMessage): FinoraUIMessage => {
  const payload = valueRecord(message.payload);
  const data: FinoraChatPayload = {
    threadId,
    messageId: message.id,
    text: message.content,
    artifacts: Array.isArray(payload.artifacts) ? (payload.artifacts as FinoraArtifact[]) : [],
    activity: Array.isArray(payload.activity)
      ? (payload.activity as FinoraChatPayload['activity'])
      : [],
    references: Array.isArray(payload.references) ? (payload.references as string[]) : [],
    clarified: payload.clarified === true,
  };
  return {
    id: message.id,
    role: message.role === 'assistant' ? 'assistant' : 'user',
    parts: [
      { type: 'text', text: message.content },
      ...(message.role === 'assistant' ? ([{ type: 'data-finora', data }] as const) : []),
    ],
  };
};

const createThreadId = () => crypto.randomUUID();
const humanize = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase());

function ArtifactHeader({ artifact, status }: { artifact: FinoraArtifact; status?: string }) {
  return (
    <div className={styles.evidenceHead}>
      <div>
        <span className={styles.cardKicker}>{humanize(artifact.type)}</span>
        <strong>{artifact.title}</strong>
      </div>
      {status && <StatusBadge status={status} />}
    </div>
  );
}

function ArtifactLink({ artifact }: { artifact: FinoraArtifact }) {
  return artifact.href ? (
    <a className={styles.artifactLink} href={artifact.href}>
      Open in workspace <FinoraIcon name="chevronRight" />
    </a>
  ) : null;
}

function SettlementArtifact({ artifact, data }: { artifact: FinoraArtifact; data: Data }) {
  return (
    <section
      className={styles.evidenceCard}
      aria-label={`Settlement evidence for ${artifact.title}`}
    >
      <ArtifactHeader
        artifact={artifact}
        status={String(data.unexplained) === '0.00' ? 'MATCHED' : 'NEEDS_REVIEW'}
      />
      <dl>
        {[
          ['Expected', data.expectedAmount],
          ['Received', data.receivedAmount],
          ['Gateway fee', data.feeAmount],
          ['GST', data.gstAmount],
          ['Refunds', data.refundAmount],
          ['Unexplained', data.unexplained],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt>{String(label)}</dt>
            <dd>
              <Amount value={String(value ?? '0')} />
            </dd>
          </div>
        ))}
      </dl>
      <ArtifactLink artifact={artifact} />
    </section>
  );
}

function ExceptionArtifact({ artifact, data }: { artifact: FinoraArtifact; data: Data }) {
  const source = valueRecord(data.result ?? data);
  const resolution = valueRecord(source.resolution ?? source.result ?? data.result);
  const confidence = Number(resolution.confidence ?? source.confidence ?? 0);
  return (
    <section
      className={styles.exceptionCard}
      aria-label={`Exception evidence for ${artifact.title}`}
    >
      <ArtifactHeader
        artifact={artifact}
        status={String(source.status ?? resolution.status ?? 'OPEN')}
      />
      <p>
        {String(resolution.reason ?? source.reason ?? 'Review the linked evidence before action.')}
      </p>
      {confidence > 0 && (
        <div className={styles.confidenceRow}>
          <span>Agent confidence</span>
          <strong>{Math.round(confidence * 100)}%</strong>
        </div>
      )}
      <p className={styles.exceptionGuardrail}>
        Proposal only. Approval is required before FinoraOS creates an adjustment.
      </p>
      <ArtifactLink artifact={artifact} />
    </section>
  );
}

const rowsFrom = (data: Data) =>
  Array.isArray(data.rows)
    ? (data.rows.filter((row) => row && typeof row === 'object') as Data[])
    : [];
const preferredColumns = (rows: Data[]) => {
  const preferred = [
    'externalId',
    'name',
    'description',
    'email',
    'category',
    'status',
    'amount',
    'occurredAt',
  ];
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    ...preferred.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !preferred.includes(key)),
  ].slice(0, 5);
};
function displayValue(key: string, value: unknown) {
  if (value === null || value === undefined) return '—';
  if (key.toLowerCase().includes('amount')) return <Amount value={String(value)} />;
  if (key.endsWith('At') && typeof value === 'string')
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  if (typeof value === 'object') return 'Details';
  return String(value).replaceAll('_', ' ');
}

function TableArtifact({ artifact, data }: { artifact: FinoraArtifact; data: Data }) {
  const rows = rowsFrom(data).slice(0, 8);
  const columns = preferredColumns(rows);
  return (
    <section className={styles.tableArtifact} aria-label={artifact.title}>
      <ArtifactHeader artifact={artifact} />
      {rows.length ? (
        <div className={styles.artifactTableWrap}>
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{humanize(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.id ?? row.externalId ?? index)}>
                  {columns.map((column) => (
                    <td key={column}>{displayValue(column, row[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.emptyArtifact}>No matching records.</p>
      )}
      <ArtifactLink artifact={artifact} />
    </section>
  );
}

function ForecastArtifact({ artifact, data }: { artifact: FinoraArtifact; data: Data }) {
  return (
    <section className={styles.metricsArtifact} aria-label={artifact.title}>
      <ArtifactHeader artifact={artifact} />
      <div className={styles.forecastRows}>
        {rowsFrom(data).map((row, index) => (
          <div key={String(row.date ?? index)} className={row.risk ? styles.forecastRisk : ''}>
            <span>{String(row.label ?? row.date ?? '')}</span>
            <strong>
              <Amount value={String(row.amount ?? '0')} />
            </strong>
            {row.risk ? <small>Shortfall risk</small> : null}
          </div>
        ))}
      </div>
      <ArtifactLink artifact={artifact} />
    </section>
  );
}

function MetricsArtifact({ artifact, data }: { artifact: FinoraArtifact; data: Data }) {
  const entries = Object.entries(data)
    .filter(([, value]) => ['string', 'number'].includes(typeof value))
    .slice(0, 6);
  return (
    <section className={styles.metricsArtifact} aria-label={artifact.title}>
      <ArtifactHeader artifact={artifact} />
      <div className={styles.metricRows}>
        {entries.map(([key, value]) => (
          <div key={key}>
            <span>{humanize(key)}</span>
            <strong>
              {key.toLowerCase().includes('amount') || key === 'total' ? (
                <Amount value={String(value)} />
              ) : (
                String(value)
              )}
            </strong>
          </div>
        ))}
      </div>
      <ArtifactLink artifact={artifact} />
    </section>
  );
}

function ArtifactCard({ artifact }: { artifact: FinoraArtifact }) {
  const data = valueRecord(artifact.data);
  if (artifact.type === 'settlement') return <SettlementArtifact artifact={artifact} data={data} />;
  if (artifact.type === 'exception') return <ExceptionArtifact artifact={artifact} data={data} />;
  if (artifact.type === 'forecast') return <ForecastArtifact artifact={artifact} data={data} />;
  if (artifact.type === 'table') return <TableArtifact artifact={artifact} data={data} />;
  return <MetricsArtifact artifact={artifact} data={data} />;
}

function Activity({ payload }: { payload?: FinoraChatPayload }) {
  if (!payload?.activity.length) return null;
  return (
    <details className={styles.activity}>
      <summary>
        <span className={styles.activityCheck}>
          <FinoraIcon name="check" />
        </span>
        {payload.activity.length} finance tool{payload.activity.length === 1 ? '' : 's'} used
      </summary>
      <ol>
        {payload.activity.map((item) => (
          <li key={item.callId}>
            <span>{humanize(item.tool)}</span>
            <small>{item.label}</small>
          </li>
        ))}
      </ol>
    </details>
  );
}

function ResponseState() {
  return (
    <div className={styles.investigation} aria-live="polite">
      <span className={`${styles.investigationDot} ${styles.investigationDotActive}`} />
      Finora is checking your finance workspace…
    </div>
  );
}

export function FinoraChat({ onInvestigationCompleted }: { onInvestigationCompleted: () => void }) {
  const threadIdRef = useRef(createThreadId());
  const transport = useMemo(
    () =>
      new DefaultChatTransport<FinoraUIMessage>({
        api: '/api/finora-chat',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, threadId: threadIdRef.current },
        }),
      }),
    [],
  );
  const { messages, sendMessage, status, error, stop, setMessages } = useChat<FinoraUIMessage>({
    transport,
    throttle: 40,
  });
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const isWorking = status === 'submitted' || status === 'streaming';
  const currentTitle = messages.length
    ? messageText(messages.find((message) => message.role === 'user') ?? messages[0]).slice(0, 52)
    : 'New conversation';

  const refreshThreads = useCallback(async () => {
    const response = await fetch('/api/finora-chat/threads', { cache: 'no-store' });
    if (response.ok) setThreads((await response.json()) as ThreadSummary[]);
    setHistoryLoading(false);
  }, []);
  const loadThread = useCallback(
    async (threadId: string, closeDrawer = true) => {
      const response = await fetch(`/api/finora-chat/threads/${encodeURIComponent(threadId)}`, {
        cache: 'no-store',
      });
      if (!response.ok) return false;
      const thread = (await response.json()) as PersistedThread;
      if (!thread.id || !Array.isArray(thread.messages)) return false;
      threadIdRef.current = thread.id;
      setMessages(thread.messages.map((message) => persistedToUiMessage(thread.id, message)));
      localStorage.setItem(activeChatThreadKey, thread.id);
      if (closeDrawer) setHistoryOpen(false);
      return true;
    },
    [setMessages],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      await refreshThreads();
      const active = localStorage.getItem(activeChatThreadKey);
      if (active) {
        const loaded = await loadThread(active, false);
        if (!loaded) localStorage.removeItem(activeChatThreadKey);
      }
    })();
  }, [loadThread, refreshThreads]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const viewport = scrollViewportRef.current;
      if (viewport)
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: messages.length > 2 ? 'smooth' : 'auto',
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [isWorking, messages]);
  useEffect(() => {
    if (status !== 'ready') return;
    const payload = [...messages].reverse().map(messagePayload).find(Boolean);
    if (payload?.threadId) {
      threadIdRef.current = payload.threadId;
      localStorage.setItem(activeChatThreadKey, payload.threadId);
      void refreshThreads();
    }
    if (payload?.artifacts.some((artifact) => artifact.type === 'exception'))
      void onInvestigationCompleted();
  }, [messages, onInvestigationCompleted, refreshThreads, status]);

  const send = async (text = input) => {
    const value = text.trim();
    if (!value || isWorking) return;
    setInput('');
    await sendMessage({ text: value });
  };
  const startNew = () => {
    threadIdRef.current = createThreadId();
    setMessages([]);
    setInput('');
    localStorage.removeItem(activeChatThreadKey);
    setHistoryOpen(false);
    composerRef.current?.focus();
  };
  const filteredThreads = threads.filter((thread) =>
    thread.title.toLowerCase().includes(historyQuery.trim().toLowerCase()),
  );

  return (
    <section className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.headerTitle}>
          <span>Finora</span>
          <span className={styles.separator}>/</span>
          <strong>{currentTitle}</strong>
        </div>
        <div className={styles.headerActions}>
          <FinoraButton className={styles.newThreadButton} onClick={startNew}>
            <FinoraIcon name="add" /> New chat
          </FinoraButton>
          <FinoraIconButton
            className={styles.historyButton}
            variant="secondary"
            aria-label="Browse chat history"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <FinoraIcon name="history" />
          </FinoraIconButton>
        </div>
      </header>
      <div className={styles.workspace}>
        <div className={styles.conversationColumn}>
          <div className={styles.scrollViewport} ref={scrollViewportRef}>
            <div
              className={`${styles.conversationScroll} ${messages.length ? styles.hasMessages : ''}`}
            >
              {!messages.length && !isWorking && (
                <section className={styles.welcome}>
                  <div className={styles.welcomeMark}>
                    <img src="/brand/logo-mark.svg" alt="" />
                  </div>
                  <p className={styles.welcomeKicker}>FINORA</p>
                  <h1 className={styles.welcomeHeading}>What can I help you investigate?</h1>
                  <p className={styles.welcomeHelper}>
                    Ask naturally. Finora selects controlled finance tools, checks the evidence, and
                    explains what it finds.
                  </p>
                  <div className={styles.suggestionGrid}>
                    {suggestions.map((suggestion) => (
                      <FinoraButton
                        key={suggestion.title}
                        className={styles.suggestionCard}
                        variant="ghost"
                        onClick={() => void send(suggestion.prompt)}
                      >
                        <strong className={styles.suggestionTitle}>{suggestion.title}</strong>
                        <span className={styles.suggestionDetail}>{suggestion.detail}</span>
                        <FinoraIcon name="chevronRight" />
                      </FinoraButton>
                    ))}
                  </div>
                </section>
              )}
              {messages.map((message) => {
                const text = messageText(message);
                const payload = messagePayload(message);
                if (!text) return null;
                return (
                  <article
                    className={`${styles.message} ${message.role === 'assistant' ? styles.assistantMessage : ''}`}
                    key={message.id}
                  >
                    <span
                      className={`${styles.avatar} ${message.role === 'assistant' ? styles.assistantAvatar : styles.userAvatar}`}
                    >
                      {message.role === 'assistant' ? <FinoraIcon name="finora" /> : 'AM'}
                    </span>
                    <div className={styles.messageContent}>
                      <p className={styles.messageAuthor}>
                        {message.role === 'assistant' ? 'Finora' : 'Aarav Mehta'}
                      </p>
                      <div className={styles.messageCopy}>{text}</div>
                      {payload?.artifacts.map((artifact, index) => (
                        <ArtifactCard
                          key={`${message.id}-${artifact.type}-${index}`}
                          artifact={artifact}
                        />
                      ))}
                      {message.role === 'assistant' && <Activity payload={payload} />}
                    </div>
                  </article>
                );
              })}
              {isWorking && <ResponseState />}
              {error && (
                <div className={styles.error}>
                  Finora could not complete this request. Your conversation is safe; check the API
                  or model and try again.
                </div>
              )}
            </div>
          </div>
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              aria-label="Ask Finora about your financial operations"
              ref={composerRef}
              value={input}
              rows={1}
              placeholder="Ask Finora about your finances…"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className={styles.composerFooter}>
              <span>
                Enter to send <b>·</b> Shift + Enter for new line
              </span>
              <div>
                {isWorking && (
                  <FinoraButton variant="ghost" size="small" onClick={stop}>
                    Stop
                  </FinoraButton>
                )}
                <FinoraIconButton
                  className={styles.sendButton}
                  type="submit"
                  variant="primary"
                  disabled={!input.trim() || isWorking}
                  aria-label="Send message to Finora"
                >
                  <FinoraIcon name="send" />
                </FinoraIconButton>
              </div>
            </div>
          </form>
          <p className={styles.disclaimer}>
            Finora is evidence-grounded. Review proposed changes before approval.
          </p>
        </div>
      </div>
      <aside
        className={`${styles.drawer} ${historyOpen ? styles.drawerOpen : ''}`}
        aria-label="Chat history"
        aria-hidden={!historyOpen}
      >
        <div className={styles.drawerHeader}>
          <div>
            <p>CHAT HISTORY</p>
            <h2>Recent conversations</h2>
          </div>
          <FinoraIconButton
            className={styles.closeButton}
            variant="ghost"
            aria-label="Close chat history"
            onClick={() => setHistoryOpen(false)}
          >
            <FinoraIcon name="close" />
          </FinoraIconButton>
        </div>
        <label className={styles.search}>
          <FinoraIcon name="search" />
          <input
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="Search conversations"
          />
        </label>
        <div className={styles.historyList}>
          {filteredThreads.length ? (
            filteredThreads.map((thread) => (
              <FinoraButton
                className={thread.id === threadIdRef.current ? styles.current : ''}
                key={thread.id}
                variant="ghost"
                onClick={() => void loadThread(thread.id)}
              >
                <strong>{thread.title}</strong>
                <span>
                  {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
                    new Date(thread.updatedAt),
                  )}
                </span>
                <FinoraIcon name="chevronRight" />
              </FinoraButton>
            ))
          ) : (
            <div className={styles.historyEmpty}>
              <span className={styles.historyEmptyIcon}>
                <FinoraIcon name="history" />
              </span>
              <strong>{historyLoading ? 'Loading conversations…' : 'No conversations yet'}</strong>
              <p>
                {historyLoading
                  ? 'Restoring your workspace.'
                  : 'Your conversations will be saved to this workspace.'}
              </p>
            </div>
          )}
        </div>
        <FinoraButton className={styles.drawerNewChat} size="small" onClick={startNew}>
          <FinoraIcon name="add" /> New chat
        </FinoraButton>
      </aside>
    </section>
  );
}
