'use client';

import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Amount, StatusBadge } from '@finora/ui';

type Data = Record<string, any>;
type Thread = { id: string; title: string; updatedAt: number; messages: Data[] };

const suggestions = [
  {
    title: 'Explain a settlement',
    prompt: 'Why was settlement STL_0001 short?',
    detail: 'Break down a variance',
  },
  {
    title: 'Review exceptions',
    prompt: 'Show unresolved exceptions above ₹25,000.',
    detail: 'Prioritise what needs review',
  },
  {
    title: 'Find a cash risk',
    prompt: 'What is our expected cash position this week?',
    detail: 'See the near-term outlook',
  },
];

const messageText = (message: { parts: Array<{ type: string; text?: string }> }) =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');

function Icon({
  name,
}: {
  name: 'spark' | 'plus' | 'send' | 'history' | 'close' | 'search' | 'chevron';
}) {
  const paths = {
    spark: (
      <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm6 12 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z" />
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    send: <path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" />,
    history: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5m4-3v6l4 2" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    search: <path d="m20 20-4.2-4.2M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" />,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function SettlementEvidence({
  settlement,
  onViewSettlement,
}: {
  settlement: Data;
  onViewSettlement: () => void;
}) {
  return (
    <section
      className="chat-evidence-card"
      aria-label={`Settlement evidence for ${settlement.externalId}`}
    >
      <div className="evidence-card-head">
        <div>
          <span className="card-kicker">Settlement breakdown</span>
          <strong>{settlement.externalId}</strong>
        </div>
        <StatusBadge status="MATCHED" />
      </div>
      <dl>
        <div>
          <dt>Expected</dt>
          <dd>
            <Amount value={settlement.expectedAmount} />
          </dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd>
            <Amount value={settlement.receivedAmount} />
          </dd>
        </div>
        <div>
          <dt>Gateway fee</dt>
          <dd>
            <Amount value={settlement.feeAmount} />
          </dd>
        </div>
        <div>
          <dt>GST</dt>
          <dd>
            <Amount value={settlement.gstAmount} />
          </dd>
        </div>
      </dl>
      <button className="evidence-link" type="button" onClick={onViewSettlement}>
        View settlement <Icon name="chevron" />
      </button>
    </section>
  );
}

function InvestigationState({ active }: { active: boolean }) {
  return (
    <div className="investigation-state" aria-live="polite">
      <span className={active ? 'investigation-dot is-active' : 'investigation-dot'} />
      {active ? 'Checking linked financial records…' : 'Checked linked financial records'}
    </div>
  );
}

const newThreadId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `thread-${Date.now()}`;

export function FinoraChat({
  settlements,
  onViewSettlement,
}: {
  settlements: Data[];
  onViewSettlement: () => void;
}) {
  const transport = useMemo(() => new TextStreamChatTransport({ api: '/api/finora-chat' }), []);
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    transport,
    throttle: 40,
  });
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState(newThreadId);
  const [historyReady, setHistoryReady] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const isWorking = status === 'submitted' || status === 'streaming';
  const currentTitle = messages.length
    ? messageText(messages.find((message) => message.role === 'user') ?? messages[0]).slice(0, 52)
    : 'New conversation';

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('finora-chat-history');
      if (stored) setThreads(JSON.parse(stored) as Thread[]);
    } catch {
      // Browser history is a convenience only; finance data remains server-side.
    }
    setHistoryReady(true);
  }, []);
  useEffect(() => {
    if (!historyReady || !messages.length) return;
    setThreads((current) => {
      const next = [
        {
          id: currentThreadId,
          title: currentTitle || 'Untitled conversation',
          updatedAt: Date.now(),
          messages: messages as unknown as Data[],
        },
        ...current.filter((thread) => thread.id !== currentThreadId),
      ].slice(0, 12);
      try {
        window.localStorage.setItem('finora-chat-history', JSON.stringify(next));
      } catch {
        /* no-op */
      }
      return next;
    });
  }, [currentThreadId, currentTitle, historyReady, messages]);

  const send = async (text = input) => {
    const value = text.trim();
    if (!value || isWorking) return;
    setInput('');
    await sendMessage({ text: value });
  };
  const startNew = () => {
    setMessages([]);
    setInput('');
    setCurrentThreadId(newThreadId());
    setHistoryOpen(false);
    composerRef.current?.focus();
  };
  const loadThread = (thread: Thread) => {
    setMessages(thread.messages as typeof messages);
    setCurrentThreadId(thread.id);
    setHistoryOpen(false);
  };
  const filteredThreads = threads.filter((thread) =>
    thread.title.toLowerCase().includes(historyQuery.trim().toLowerCase()),
  );

  return (
    <section className="finora-chat-shell">
      <header className="chat-topbar">
        <div className="chat-header-actions">
          <button className="new-thread-button" type="button" onClick={startNew}>
            <Icon name="plus" /> New chat
          </button>
          <button
            className="history-button"
            type="button"
            aria-label="Browse chat history"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <Icon name="history" />
          </button>
        </div>
        <div className="chat-header-title">
          <img src="/brand/logo-mark.svg" alt="" />
          <span>Finora</span>
          <span className="header-separator">/</span>
          <strong>{currentTitle}</strong>
        </div>
        <div className="chat-header-meta">Acme Commerce India</div>
      </header>

      <div className="chat-workspace">
        <div className="conversation-column">
          <div className={`conversation-scroll ${messages.length ? 'has-messages' : ''}`}>
            {!messages.length && !isWorking && (
              <section className="finora-welcome">
                <div className="welcome-mark">
                  <img src="/brand/logo-mark.svg" alt="" />
                </div>
                <p className="welcome-kicker">FINORA</p>
                <h1>What can I help you reconcile?</h1>
                <p>Ask about settlements, exceptions, records, or the cash position.</p>
                <div className="suggestion-grid">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.title}
                      type="button"
                      onClick={() => {
                        void send(suggestion.prompt);
                      }}
                    >
                      <strong>{suggestion.title}</strong>
                      <span>{suggestion.detail}</span>
                      <Icon name="chevron" />
                    </button>
                  ))}
                </div>
              </section>
            )}
            {messages.map((message) => {
              const text = messageText(message);
              if (!text) return null;
              const settlement =
                message.role === 'assistant'
                  ? settlements.find((item) => text.includes(item.externalId))
                  : undefined;
              return (
                <article className={`chat-message chat-message-${message.role}`} key={message.id}>
                  <span
                    className={`message-avatar ${message.role === 'assistant' ? 'assistant-avatar' : 'user-avatar'}`}
                  >
                    {message.role === 'assistant' ? <Icon name="spark" /> : 'AM'}
                  </span>
                  <div className="message-content">
                    <p className="message-author">
                      {message.role === 'assistant' ? 'Finora' : 'Aarav Mehta'}
                    </p>
                    <div className="message-copy">{text}</div>
                    {settlement && (
                      <SettlementEvidence
                        settlement={settlement}
                        onViewSettlement={onViewSettlement}
                      />
                    )}
                    {message.role === 'assistant' && <InvestigationState active={false} />}
                  </div>
                </article>
              );
            })}
            {isWorking && <InvestigationState active />}
            {error && (
              <div className="chat-error">
                Finora could not complete this request. Check the local API and try again.
              </div>
            )}
          </div>

          <form
            className="finora-composer"
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
              placeholder="Ask Finora anything about your finances…"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="composer-footer">
              <span>
                Enter to send <b>·</b> Shift + Enter for new line
              </span>
              <div>
                {isWorking && (
                  <button className="stop-button" type="button" onClick={stop}>
                    Stop
                  </button>
                )}
                <button
                  className="send-button"
                  type="submit"
                  disabled={!input.trim() || isWorking}
                  aria-label="Send message to Finora"
                >
                  <Icon name="send" />
                </button>
              </div>
            </div>
          </form>
          <p className="chat-disclaimer">
            Finora uses your connected financial records. Verify recommendations before taking
            action.
          </p>
        </div>
      </div>

      <aside
        className={`chat-history-drawer ${historyOpen ? 'is-open' : ''}`}
        aria-label="Chat history"
        aria-hidden={!historyOpen}
      >
        <div className="history-drawer-header">
          <div>
            <p>CHAT HISTORY</p>
            <h2>Recent conversations</h2>
          </div>
          <button
            type="button"
            className="history-close"
            aria-label="Close chat history"
            onClick={() => setHistoryOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <label className="history-search">
          <Icon name="search" />
          <input
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="Search conversations"
          />
        </label>
        <div className="history-list">
          {filteredThreads.length ? (
            filteredThreads.map((thread) => (
              <button
                className={thread.id === currentThreadId ? 'is-current' : ''}
                key={thread.id}
                type="button"
                onClick={() => loadThread(thread)}
              >
                <strong>{thread.title}</strong>
                <span>
                  {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
                    thread.updatedAt,
                  )}
                </span>
                <Icon name="chevron" />
              </button>
            ))
          ) : (
            <div className="history-empty">
              <span className="history-empty-icon">
                <Icon name="history" />
              </span>
              <strong>No conversations yet</strong>
              <p>Chats started here will appear in this browser.</p>
            </div>
          )}
        </div>
        <button className="drawer-new-chat" type="button" onClick={startNew}>
          <Icon name="plus" /> New chat
        </button>
      </aside>
    </section>
  );
}
