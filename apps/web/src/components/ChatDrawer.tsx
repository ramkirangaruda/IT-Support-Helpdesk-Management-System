import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/api';

interface ChatMsg {
  role: 'USER' | 'ASSISTANT';
  content: string;
}

interface SendResponse {
  message: { id: string; role: string; content: string };
  deflected: boolean;
  ticketId: string | null;
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
  const [isOpen, setIsOpen]         = useState(false);
  const [sessionId, setSessionId]   = useState<string | null>(null);
  const [messages, setMessages]     = useState<ChatMsg[]>([]);
  const [input, setInput]           = useState('');
  const [isLoading, setIsLoading]   = useState(false);
  const [ticketId, setTicketId]     = useState<string | null>(null);
  const [deflected, setDeflected]   = useState(false);
  const [deflectAck, setDeflectAck] = useState<'yes' | 'no' | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages or loading state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Auto-resize textarea as content grows
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
      if (data.ticketId)  setTicketId(data.ticketId);
      if (data.deflected) setDeflected(true);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'ASSISTANT',
          content:
            "Sorry, I'm having trouble connecting right now. You can still submit a ticket directly from the portal.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Bubble button ─────────────────────────────────────────────────────────
  return (
    <>
      <button
        onClick={() => setIsOpen(o => !o)}
        aria-label={isOpen ? 'Close IT support chat' : 'Open IT support chat'}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3
                    rounded-full shadow-xl text-sm font-semibold transition-all duration-200
                    ${ticketId
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
      >
        {isOpen ? (
          /* X close icon when drawer is open */
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : ticketId ? (
          /* Green checkmark after ticket created */
          <>
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="hidden sm:inline max-w-[140px] truncate">{ticketId} created</span>
          </>
        ) : (
          /* Default chat icon */
          <>
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
            <span className="hidden sm:inline">IT Support</span>
          </>
        )}
      </button>

      {/* ── Slide-in drawer ─────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-label="IT support chat"
        className={`fixed top-0 right-0 h-full w-[380px] max-w-[100vw] bg-white shadow-2xl
                    flex flex-col z-40 transition-transform duration-300 ease-in-out
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
            <span className="font-semibold text-sm">IT Support Chat</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-indigo-200 hover:text-white transition-colors"
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
          {/* Static welcome bubble */}
          <div className="flex gap-2 items-start">
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
              <BotIcon />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-none px-3 py-2 max-w-[270px]">
              <p className="text-sm text-gray-700 leading-snug">{WELCOME}</p>
            </div>
          </div>

          {/* Conversation messages */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 items-end ${msg.role === 'USER' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {msg.role === 'ASSISTANT' && (
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <BotIcon />
                </div>
              )}
              <div
                className={`rounded-2xl px-3 py-2 max-w-[270px] text-sm whitespace-pre-wrap break-words
                  ${msg.role === 'USER'
                    ? 'bg-indigo-600 text-white rounded-br-none ml-auto'
                    : 'bg-gray-100 text-gray-800 rounded-tl-none'}`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex gap-2 items-end">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <BotIcon />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-3 flex gap-1.5">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              </div>
            </div>
          )}

          {/* Deflection resolved panel */}
          {deflected && !ticketId && !isLoading && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              {deflectAck ? (
                <p className="text-sm text-green-700">
                  {deflectAck === 'yes'
                    ? "Great! Glad I could help. 👍"
                    : "Thanks for the feedback. Feel free to submit a ticket if the issue persists."}
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-green-800 mb-2">✓ Resolved</p>
                  <p className="text-xs text-green-700 mb-2">Was this helpful?</p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => setDeflectAck('yes')}
                      className="px-3 py-1 text-xs rounded-lg bg-green-600 text-white
                                 hover:bg-green-700 transition-colors font-medium"
                    >
                      👍 Yes
                    </button>
                    <button
                      onClick={() => setDeflectAck('no')}
                      className="px-3 py-1 text-xs rounded-lg border border-green-300 text-green-700
                                 hover:bg-green-100 transition-colors font-medium"
                    >
                      👎 No
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Ticket created panel */}
          {ticketId && !isLoading && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-sm font-semibold text-green-800 mb-1">✓ Ticket created</p>
              <Link
                to={`/tickets/${ticketId}`}
                onClick={() => setIsOpen(false)}
                className="text-sm text-indigo-600 hover:underline font-medium"
              >
                {ticketId} — click to view →
              </Link>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-gray-200 p-3 shrink-0 bg-white">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type your message…"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         disabled:bg-gray-50 overflow-y-auto"
              style={{ maxHeight: '112px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
          {messages.length === 0 && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              Enter to send · Shift+Enter for new line
            </p>
          )}
        </div>
      </div>
    </>
  );
}
