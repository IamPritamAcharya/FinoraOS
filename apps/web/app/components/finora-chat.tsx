'use client';

import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Amount, FinoraButton, FinoraIcon, FinoraIconButton, StatusBadge } from '@finora/ui';
import styles from './finora-chat.module.css';

type Data = Record<string, any>;
type Thread = { id: string; title: string; updatedAt: number; messages: Data[] };
const chatHistoryKey = 'finora-chat-history';
const activeChatThreadKey = 'finora-active-chat-thread';

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

function SettlementEvidence({
  settlement,
  onViewSettlement,
}: {
  settlement: Data;
  onViewSettlement: () => void;
}) {
  return (
    <section
      className={styles.evidenceCard}
      aria-label={`Settlement evidence for ${settlement.externalId}`}
    >
      <div className={styles.evidenceHead}>
        <div>
          <span className={styles.cardKicker}>Settlement breakdown</span>
          <strong>{settlement.externalId}</strong>
        </div>
        <StatusBadge status="MATCHED" label="Explained variance" />
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
        <div>
          <dt>Refunds</dt>
          <dd>
            <Amount value={settlement.refundAmount} />
          </dd>
        </div>
      </dl>
      <FinoraButton
        className={styles.evidenceLink}
        variant="ghost"
        size="small"
        onClick={onViewSettlement}
      >
        View settlement <FinoraIcon name="chevronRight" />
      </FinoraButton>
    </section>
  );
}

function InvestigationState({ active }: { active: boolean }) {
  return (
    <div className={styles.investigation} aria-live="polite">
      <span
        className={`${styles.investigationDot} ${active ? styles.investigationDotActive : ''}`}
      />
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
      const stored = window.localStorage.getItem(chatHistoryKey);
      const savedThreads = stored ? (JSON.parse(stored) as Thread[]) : [];
      setThreads(savedThreads);

      const activeThreadId = window.localStorage.getItem(activeChatThreadKey);
      const activeThread =
        savedThreads.find((thread) => thread.id === activeThreadId) ?? savedThreads[0];
      if (activeThread) {
        setCurrentThreadId(activeThread.id);
        setMessages(activeThread.messages as typeof messages);
      }
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
        window.localStorage.setItem(chatHistoryKey, JSON.stringify(next));
        window.localStorage.setItem(activeChatThreadKey, currentThreadId);
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
    try {
      window.localStorage.removeItem(activeChatThreadKey);
    } catch {
      // A new blank chat has no persisted thread until its first message.
    }
    setHistoryOpen(false);
    composerRef.current?.focus();
  };
  const loadThread = (thread: Thread) => {
    setMessages(thread.messages as typeof messages);
    setCurrentThreadId(thread.id);
    try {
      window.localStorage.setItem(activeChatThreadKey, thread.id);
    } catch {
      // Browser history is optional.
    }
    setHistoryOpen(false);
  };
  const filteredThreads = threads.filter((thread) =>
    thread.title.toLowerCase().includes(historyQuery.trim().toLowerCase()),
  );

  return (
    <section className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.headerTitle}>
          <img src="/brand/logo-mark.svg" alt="" />
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
            type="button"
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
          <div className={styles.scrollViewport}>
            <div
              className={`${styles.conversationScroll} ${messages.length ? styles.hasMessages : ''}`}
            >
              {!messages.length && !isWorking && (
                <section className={styles.welcome}>
                  <div className={styles.welcomeMark}>
                    <img src="/brand/logo-mark.svg" alt="" />
                  </div>
                  <p className={styles.welcomeKicker}>FINORA</p>
                  <h1 className={styles.welcomeHeading}>What can I help you reconcile?</h1>
                  <p className={styles.welcomeHelper}>
                    Ask about settlements, exceptions, records, or the cash position.
                  </p>
                  <div className={styles.suggestionGrid}>
                    {suggestions.map((suggestion) => (
                      <FinoraButton
                        key={suggestion.title}
                        className={styles.suggestionCard}
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          void send(suggestion.prompt);
                        }}
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
                if (!text) return null;
                const settlement =
                  message.role === 'assistant'
                    ? settlements.find((item) => text.includes(item.externalId))
                    : undefined;
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
                <div className={styles.error}>
                  Finora could not complete this request. Check the local API and try again.
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
              placeholder="Ask Finora anything about your finances…"
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
            Finora uses your connected financial records. Verify recommendations before taking
            action.
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
                className={thread.id === currentThreadId ? styles.current : ''}
                key={thread.id}
                type="button"
                variant="ghost"
                onClick={() => loadThread(thread)}
              >
                <strong>{thread.title}</strong>
                <span>
                  {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
                    thread.updatedAt,
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
              <strong>No conversations yet</strong>
              <p>Chats started here will appear in this browser.</p>
            </div>
          )}
        </div>
        <FinoraButton className={styles.drawerNewChat} onClick={startNew}>
          <FinoraIcon name="add" /> New chat
        </FinoraButton>
      </aside>
    </section>
  );
}
