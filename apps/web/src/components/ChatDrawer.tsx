import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/api';

interface ChatMsg {
  role:    'USER' | 'ASSISTANT';
  content: string;
}

interface SendResponse {
  message:    { id: string; role: string; content: string };
  deflected:  boolean;
  ticketId:   string | null;
  kbArticles: { id: string; title: string }[];
}

const WELCOME =
  "Hi! I'm your IT support assistant. Describe your issue and I'll try to help — or create a ticket if needed.";

const BotIcon = () => (
  <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
  </svg>
);

const SendIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

export default function ChatDrawer() {
  const queryClient = useQueryClient();
  const [isOpen,      setIsOpen]      = useState(false);
  const [sessionId,   setSessionId]   = useState<string | null>(null);
  const [messages,    setMessages]    = useState<ChatMsg[]>([]);
  const [input,       setInput]       = useState('');
  const [isLoading,   setIsLoading]   = useState(false);
  const [ticketId,    setTicketId]    = useState<string | null>(null);
  const [deflected,   setDeflected]   = useState(false);
  const [deflectAck,  setDeflectAck]  = useState<'yes' | 'no' | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
    }
  }, [input]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || isLoading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'USER', content }]);
    setIsLoading(true);
    try {
      let sid = sessionId;
      if (!sid) {
        const { data } = await api.post<{ id: string }>('/chat/sessions');
        sid = data.id;
        setSessionId(sid);
      }
      const { data } = await api.post<SendResponse>(
        `/chat/sessions/${sid}/messages`,
        { content },
      );
      setMessages(prev => [...prev, { role: 'ASSISTANT', content: data.message.content }]);
      if (data.ticketId) {
        setTicketId(data.ticketId);
        void queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
      }
      if (data.deflected) setDeflected(true);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'ASSISTANT',
          content: "Sorry, I'm having trouble connecting right now. You can still submit a ticket directly from the portal.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <>
      {/* Float button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        aria-label={isOpen ? 'Close IT support chat' : 'Open IT support chat'}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3
                    rounded-full text-sm font-semibold
                    ${ticketId
                      ? 'bg-[#1a7f4b] hover:bg-[#166940] text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
      >
        {isOpen ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : ticketId ? (
          <>
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="hidden sm:inline max-w-[140px] truncate">{ticketId} created</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
            <span className="hidden sm:inline">IT Support</span>
          </>
        )}
      </button>

      {/* Slide-in drawer */}
      <div
        role="dialog"
        aria-label="IT support chat"
        className={`fixed top-0 right-0 h-full w-[380px] max-w-[100vw] bg-white border-l border-hair
                    flex flex-col z-40
                    transition-transform duration-300 ease-[cubic-bezier(0.28,0.11,0.32,1)]
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header — white, not filled accent */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hair shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#e0f0fe] flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
            </div>
            <span className="font-semibold text-sm text-ink">IT Support Chat</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-ink-muted hover:text-ink"
            aria-label="Close chat"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Welcome bubble */}
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-[#e0f0fe] flex items-center justify-center shrink-0 mt-0.5">
              <BotIcon />
            </div>
            <div className="bg-[#f2f2f7] rounded-2xl rounded-tl-none px-3 py-2 max-w-[270px]">
              <p className="text-sm text-ink-soft leading-snug">{WELCOME}</p>
            </div>
          </div>

          {/* Conversation */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 items-end ${msg.role === 'USER' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {msg.role === 'ASSISTANT' && (
                <div className="w-7 h-7 rounded-full bg-[#e0f0fe] flex items-center justify-center shrink-0">
                  <BotIcon />
                </div>
              )}
              <div
                className={`rounded-2xl px-3 py-2 max-w-[270px] text-sm whitespace-pre-wrap break-words
                  ${msg.role === 'USER'
                    ? 'bg-indigo-600 text-white rounded-br-none ml-auto'
                    : 'bg-[#f2f2f7] text-ink rounded-tl-none'}`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Typing indicator — allowed (functional feedback, not decorative animation) */}
          {isLoading && (
            <div className="flex gap-2 items-end">
              <div className="w-7 h-7 rounded-full bg-[#e0f0fe] flex items-center justify-center shrink-0">
                <BotIcon />
              </div>
              <div className="bg-[#f2f2f7] rounded-2xl rounded-tl-none px-4 py-3 flex gap-1.5">
                <span className="w-2 h-2 bg-[#8e8e93] rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-[#8e8e93] rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-[#8e8e93] rounded-full animate-bounce" />
              </div>
            </div>
          )}

          {/* Deflection panel */}
          {deflected && !ticketId && !isLoading && (
            <div className="bg-[#eafaf3] border border-[#a3d9b8] rounded-xl p-3 text-center">
              {deflectAck ? (
                <p className="text-sm text-[#1a7f4b]">
                  {deflectAck === 'yes'
                    ? "Great! Glad I could help."
                    : "Thanks for the feedback. Feel free to submit a ticket if the issue persists."}
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-[#1a7f4b] mb-1">Resolved</p>
                  <p className="text-xs text-[#1a7f4b] mb-2 opacity-80">Was this helpful?</p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => setDeflectAck('yes')}
                      className="px-3 py-1 text-xs rounded-lg bg-[#1a7f4b] text-white
                                 hover:bg-[#166940] font-medium"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeflectAck('no')}
                      className="px-3 py-1 text-xs rounded-lg border border-[#a3d9b8] text-[#1a7f4b]
                                 hover:bg-[#d4f0e3] font-medium"
                    >
                      No
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Ticket created panel */}
          {ticketId && !isLoading && (
            <div className="bg-[#eafaf3] border border-[#a3d9b8] rounded-xl p-3 text-center">
              <p className="text-sm font-semibold text-[#1a7f4b] mb-1">Ticket created</p>
              <Link
                to={`/tickets/${ticketId}`}
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline font-medium"
              >
                <span className="ticket-id">{ticketId}</span>
                <span className="text-ink-muted">— click to view →</span>
              </Link>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-hair p-3 shrink-0 bg-white">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type your message…"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl border border-hair px-3 py-2 text-sm text-ink
                         placeholder:text-ink-muted
                         focus:outline-none focus:border-2 focus:border-indigo-600
                         disabled:bg-[#fafafa] overflow-y-auto"
              style={{ maxHeight: '112px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700
                         disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
          {messages.length === 0 && (
            <p className="text-xs text-ink-muted mt-2 text-center">
              Enter to send · Shift+Enter for new line
            </p>
          )}
        </div>
      </div>
    </>
  );
}
