'use client';

import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { useMemo, useRef, useState } from 'react';
import { Amount, StatusBadge } from '@finora/ui';

type Data = Record<string, any>;

const suggestions = [
  'Why was settlement STL_0001 short?',
  'Show unresolved exceptions above ₹25,000.',
  'What is our expected cash position this week?',
];

const messageText = (message: { parts: Array<{ type: string; text?: string }> }) =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');

function Icon({ name }: { name: 'spark' | 'plus' | 'send' | 'shield' | 'database' | 'calc' }) {
  const paths = {
    spark: (
      <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm6 12 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z" />
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    send: <path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13" />,
    shield: <path d="M12 3 5 6v5c0 4.6 3 7.8 7 10 4-2.2 7-5.4 7-10V6l-7-3Zm-3 9 2 2 4-4" />,
    database: (
      <path d="M19 6c0 1.7-3.1 3-7 3S5 7.7 5 6s3.1-3 7-3 7 1.3 7 3Zm0 0v6c0 1.7-3.1 3-7 3s-7-1.3-7-3V6m14 6v6c0 1.7-3.1 3-7 3s-7-1.3-7-3v-6" />
    ),
    calc: (
      <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 4h6M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    ),
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
          <span className="card-kicker">Settlement evidence</span>
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
          <dt>Gateway fees</dt>
          <dd>
            <Amount value={settlement.feeAmount} />
          </dd>
        </div>
        <div>
          <dt>GST on fees</dt>
          <dd>
            <Amount value={settlement.gstAmount} />
          </dd>
        </div>
      </dl>
      <button className="evidence-link" type="button" onClick={onViewSettlement}>
        Open settlement record <span>→</span>
      </button>
    </section>
  );
}

function ToolActivity({ streaming }: { streaming: boolean }) {
  const steps = [
    ['database', 'Locate financial records'],
    ['calc', 'Calculate deterministic breakdown'],
    ['shield', 'Validate grounded response'],
  ] as const;
  return (
    <div className="tool-activity" aria-live="polite">
      <div className="tool-activity-label">
        <span className="activity-pulse" /> Finora is investigating
      </div>
      {steps.map(([icon, label], index) => (
        <div
          className={`tool-step ${streaming && index === 2 ? 'tool-step-active' : ''}`}
          key={label}
        >
          <span className="tool-icon">
            <Icon name={icon} />
          </span>
          <span>{label}</span>
          <span className="tool-step-state">
            {streaming && index === 2 ? 'Checking' : 'Complete'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FinoraChat({
  settlements,
  openExceptions,
  onViewSettlement,
}: {
  settlements: Data[];
  openExceptions: Data[];
  onViewSettlement: () => void;
}) {
  const transport = useMemo(() => new TextStreamChatTransport({ api: '/api/finora-chat' }), []);
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    transport,
    throttle: 40,
  });
  const [input, setInput] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const isWorking = status === 'submitted' || status === 'streaming';
  const latestSettlement = [...messages]
    .reverse()
    .map(messageText)
    .map((text) => settlements.find((settlement) => text.includes(settlement.externalId)))
    .find(Boolean);

  const send = async (text = input) => {
    const value = text.trim();
    if (!value || isWorking) return;
    setInput('');
    await sendMessage({ text: value });
  };

  return (
    <section className="finora-chat-shell">
      <header className="chat-topbar">
        <div className="chat-title-lockup">
          <span className="finora-orb">
            <Icon name="spark" />
          </span>
          <div>
            <div className="chat-title-row">
              <h2>Finora</h2>
              <span className="available-badge">
                <span /> Available
              </span>
            </div>
            <p>AI-native financial operations</p>
          </div>
        </div>
        <button
          className="new-thread-button"
          type="button"
          onClick={() => {
            setMessages([]);
            setInput('');
            composerRef.current?.focus();
          }}
        >
          <Icon name="plus" /> New conversation
        </button>
      </header>

      <div className="chat-workspace">
        <div className="conversation-column">
          <div className="conversation-scroll">
            <article className="finora-welcome">
              <span className="message-avatar assistant-avatar">
                <Icon name="spark" />
              </span>
              <div className="message-content">
                <p className="message-author">
                  Finora <span>Controlled intelligence</span>
                </p>
                <h1>What would you like to investigate?</h1>
                <p>
                  I’ll use controlled finance tools, show the evidence, and keep calculations
                  deterministic.
                </p>
                <div className="suggestion-grid">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        void send(suggestion);
                      }}
                    >
                      {suggestion}
                      <span>↗</span>
                    </button>
                  ))}
                </div>
              </div>
            </article>

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
                      {message.role === 'assistant' && <span> Evidence-grounded</span>}
                    </p>
                    <div className="message-copy">{text}</div>
                    {settlement && (
                      <SettlementEvidence
                        settlement={settlement}
                        onViewSettlement={onViewSettlement}
                      />
                    )}
                  </div>
                </article>
              );
            })}
            {isWorking && <ToolActivity streaming={status === 'streaming'} />}
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
              placeholder="Ask Finora to investigate, explain, or review…"
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
                <Icon name="shield" /> Controlled tools only
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
            Finora can explain and propose. Financial changes remain subject to policy and approval.
          </p>
        </div>

        <aside className="chat-context" aria-label="Conversation context">
          <div className="context-section">
            <p className="context-heading">CONVERSATION CONTEXT</p>
            <div className="context-record">
              <span className="context-icon">
                <Icon name="database" />
              </span>
              <div>
                <strong>Acme Commerce India</strong>
                <small>Demo organization</small>
              </div>
            </div>
          </div>
          <div className="context-section">
            <p className="context-heading">CURRENT FOCUS</p>
            {latestSettlement ? (
              <div className="focus-record">
                <strong>{latestSettlement.externalId}</strong>
                <span>Settlement evidence attached</span>
                <Amount value={latestSettlement.receivedAmount} />
              </div>
            ) : (
              <p className="context-empty">
                Select a record through a question to attach its evidence here.
              </p>
            )}
          </div>
          <div className="context-section">
            <p className="context-heading">OPEN EXCEPTIONS</p>
            <div className="exception-context-list">
              {openExceptions.slice(0, 3).map((item) => (
                <div key={item.id}>
                  <div>
                    <strong>{item.externalId}</strong>
                    <small>{item.type.replaceAll('_', ' ')}</small>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          </div>
          <div className="guardrail-note">
            <Icon name="shield" />
            <p>
              <strong>Financial guardrail</strong>Amounts, matches and variances are calculated
              deterministically before Finora explains them.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
