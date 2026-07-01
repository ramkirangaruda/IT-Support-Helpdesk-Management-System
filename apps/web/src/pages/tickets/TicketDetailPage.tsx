import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { useAuth } from '../../auth/useAuth';
import { allowedTransitions, isTerminal, STATUS_LABEL } from '../../lib/ticketStateMachine';

// ── Shared types ──────────────────────────────────────────────────────────────

interface Actor { id: string; name: string; email: string }

interface Comment {
  id:         string;
  body:       string;
  isInternal: boolean;
  createdAt:  string;
  author:     Actor;
}

interface StatusHistoryEntry {
  id:         string;
  fromStatus: string | null;
  toStatus:   string;
  reason:     string | null;
  createdAt:  string;
  actor:      Actor | null;
}

interface Ticket {
  id:               string;
  subject:          string;
  description:      string;
  priority:         string;
  status:           string;
  source:           string;
  category:         { id: string; name: string } | null;
  requester:        Actor;
  assignee:         Actor | null;
  slaResolutionDue: string | null;
  slaResponseDue:   string | null;
  slaPausedMs:      number;
  pausedAt:         string | null;
  createdAt:        string;
  updatedAt:        string;
  comments:         Comment[];
  statusHistory:    StatusHistoryEntry[];
}

// ── Style maps ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  NEW:         'bg-[#f2f2f7] text-[#6e6e73]',
  ASSIGNED:    'bg-[#e0f0fe] text-[#0071e3]',
  IN_PROGRESS: 'bg-[#eef0fb] text-[#3b5cc3]',
  ON_HOLD:     'bg-[#fef9ec] text-[#b07800]',
  ESCALATED:   'bg-[#fff2ea] text-[#b45309]',
  RESOLVED:    'bg-[#eafaf3] text-[#1a7f4b]',
  CLOSED:      'bg-[#f2f2f7] text-[#86868b]',
  REOPENED:    'bg-[#f5f0fd] text-[#7c3aed]',
  CANCELLED:   'bg-[#fff1f2] text-[#c0392b]',
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW:      'bg-[#f2f2f7] text-[#6e6e73]',
  MEDIUM:   'bg-[#e0f0fe] text-[#0071e3]',
  HIGH:     'bg-[#fff2ea] text-[#b45309]',
  CRITICAL: 'bg-[#fff1f2] text-[#c0392b]',
};

// ── Small reusable components ─────────────────────────────────────────────────

function Badge({ label, styleMap }: { label: string; styleMap: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${styleMap[label] ?? 'bg-[#f2f2f7] text-[#6e6e73]'}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1">
      <dt className="w-28 shrink-0 text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em]">
        {label}
      </dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

// ── Resolve modal ─────────────────────────────────────────────────────────────

function ResolveModal({
  onConfirm,
  onCancel,
  isPending,
}: {
  onConfirm: (summary: string) => void;
  onCancel:  () => void;
  isPending: boolean;
}) {
  const [summary, setSummary] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-xl border border-hair p-6">
        <h2 className="text-base font-semibold text-ink mb-1">Resolve Ticket</h2>
        <p className="text-sm text-ink-muted mb-4">
          Provide a resolution summary before marking this ticket as resolved.
        </p>
        <textarea
          value={summary}
          onChange={e => setSummary(e.target.value)}
          rows={5}
          placeholder="Describe how the issue was resolved…"
          autoFocus
          className="w-full rounded-lg border border-hair px-3 py-2 text-sm text-ink
                     focus:outline-none focus:border-2 focus:border-indigo-600
                     resize-y mb-4"
        />
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft
                       hover:bg-[#fafafa] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => summary.trim() && onConfirm(summary.trim())}
            disabled={!summary.trim() || isPending}
            className="px-4 py-2 rounded-lg bg-[#1a7f4b] text-white text-sm font-medium
                       hover:bg-[#166940] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Resolving…' : 'Mark Resolved'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <Layout>
      <div className="h-4 w-24 bg-[#f2f2f7] rounded mb-8 animate-pulse" />
      <div className="flex gap-3 mb-6 animate-pulse">
        <div className="h-6 w-20 bg-[#f2f2f7] rounded-md" />
        <div className="flex-1">
          <div className="h-6 w-80 bg-[#f2f2f7] rounded mb-1.5" />
          <div className="h-3 w-40 bg-[#f2f2f7] rounded" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-hair p-5 h-36 animate-pulse" />
          <div className="bg-white rounded-xl border border-hair p-5 h-48 animate-pulse" />
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-hair p-5 h-40 animate-pulse" />
          <div className="bg-white rounded-xl border border-hair p-5 h-60 animate-pulse" />
        </div>
      </div>
    </Layout>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const AGENT_ROLES       = new Set(['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN']);
const ADMIN_ROLES       = new Set(['IT_ADMIN', 'SYS_ADMIN']);
const SPECIAL_TRANSITIONS = new Set(['ON_HOLD', 'RESOLVED']);

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isEmployee = user?.roles.every(r => r === 'EMPLOYEE');
  const isAgent    = user?.roles.some(r => AGENT_ROLES.has(r));
  const isAdmin    = user?.roles.some(r => ADMIN_ROLES.has(r));

  const [commentBody,      setCommentBody]      = useState('');
  const [isInternal,       setIsInternal]       = useState(false);
  const [moveToStatus,     setMoveToStatus]     = useState('');
  const [showOnHoldInput,  setShowOnHoldInput]  = useState(false);
  const [onHoldReason,     setOnHoldReason]     = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [aiResult,         setAiResult]         = useState<string | null>(null);
  const [aiAction,         setAiAction]         = useState<string | null>(null);

  const { data: ticket, isLoading, isError } = useQuery<Ticket>({
    queryKey: ['ticket', id],
    queryFn:  () => api.get<Ticket>(`/tickets/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ticket', id] });

  const addCommentMutation = useMutation({
    mutationFn: (vars: { body: string; isInternal: boolean }) =>
      api.post(`/tickets/${id}/comments`, vars).then(r => r.data),
    onSuccess: () => { setCommentBody(''); setIsInternal(false); invalidate(); },
  });

  const transitionMutation = useMutation({
    mutationFn: (vars: { toStatus: string; reason?: string }) =>
      api.post(`/tickets/${id}/transition`, vars).then(r => r.data),
    onSuccess: () => {
      setMoveToStatus(''); setShowOnHoldInput(false); setOnHoldReason(''); invalidate();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (resolutionSummary: string) =>
      api.post(`/tickets/${id}/resolve`, { resolutionSummary }).then(r => r.data),
    onSuccess: () => { setShowResolveModal(false); invalidate(); },
  });

  const agentAssistMutation = useMutation({
    mutationFn: ({ action, summary, comments }: { action: string; summary: string; comments: string[] }) =>
      api.post<{ result: string }>('/ai/agent-assist', {
        ticket_id: id, ticket_summary: summary, comments, action,
      }).then(r => r.data),
    onSuccess: (data, { action }) => { setAiResult(data.result); setAiAction(action); },
  });

  if (isLoading) return <DetailSkeleton />;

  if (isError || !ticket) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 text-ink-muted gap-3">
          <p className="text-sm font-medium text-[#c0392b]">Ticket not found or failed to load.</p>
          <Link to="/tickets" className="text-sm text-indigo-600 hover:underline">
            ← Back to tickets
          </Link>
        </div>
      </Layout>
    );
  }

  const allowed          = allowedTransitions(ticket.status);
  const canHold          = allowed.includes('ON_HOLD');
  const canResolve       = allowed.includes('RESOLVED');
  const dropdownOptions  = allowed.filter(s => !SPECIAL_TRANSITIONS.has(s));
  const terminal         = isTerminal(ticket.status);
  const visibleComments  = isEmployee ? ticket.comments.filter(c => !c.isInternal) : ticket.comments;

  return (
    <>
      {showResolveModal && (
        <ResolveModal
          onConfirm={summary => resolveMutation.mutate(summary)}
          onCancel={() => setShowResolveModal(false)}
          isPending={resolveMutation.isPending}
        />
      )}

      <Layout>
        <div className="mb-6">
          <Link to="/tickets" className="text-sm text-ink-muted hover:text-indigo-600">
            ← Back to tickets
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 mb-8">
          <span className="ticket-id mt-0.5 shrink-0">{ticket.id}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-[22px] font-semibold text-ink leading-tight">{ticket.subject}</h1>
            <p className="text-xs text-ink-muted mt-0.5">Opened {formatDate(ticket.createdAt)}</p>
          </div>
          {isAdmin && !terminal && (
            <Link
              to={`/admin/assign/${ticket.id}`}
              className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-hair
                         text-ink-soft hover:bg-[#fafafa] font-medium"
            >
              {ticket.assignee ? 'Reassign' : 'Assign'}
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column ──────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Description */}
            <div className="bg-white rounded-xl border border-hair p-5">
              <h2 className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-3">
                Description
              </h2>
              <p className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">
                {ticket.description}
              </p>
            </div>

            {/* Confirm Resolution (EMPLOYEE only) */}
            {isEmployee && ticket.status === 'RESOLVED' && (
              <div className="bg-[#eafaf3] border border-[#a3d9b8] rounded-xl p-5
                              flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#1a7f4b]">Issue resolved?</p>
                  <p className="text-xs text-[#1a7f4b] mt-0.5 opacity-80">
                    Confirm that your issue has been resolved to close this ticket.
                  </p>
                </div>
                <button
                  onClick={() => transitionMutation.mutate({ toStatus: 'CLOSED' })}
                  disabled={transitionMutation.isPending}
                  className="shrink-0 px-4 py-2 rounded-lg bg-[#1a7f4b] text-white text-sm font-medium
                             hover:bg-[#166940] disabled:opacity-50"
                >
                  {transitionMutation.isPending ? 'Closing…' : 'Confirm Resolution'}
                </button>
              </div>
            )}

            {/* Comments */}
            <div className="bg-white rounded-xl border border-hair p-5">
              <h2 className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-4">
                Comments{visibleComments.length > 0 && ` (${visibleComments.length})`}
              </h2>

              {visibleComments.length === 0 && (
                <p className="text-sm text-ink-muted mb-4">No comments yet.</p>
              )}

              <div className="space-y-4 mb-5">
                {visibleComments.map(c => (
                  <div
                    key={c.id}
                    className={`flex gap-3 rounded-lg p-3 -mx-1
                                ${c.isInternal
                                  ? 'border-l-2 border-l-[#b07800] bg-[#fef9ec]'
                                  : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center
                                     text-xs font-semibold shrink-0
                                     ${c.isInternal
                                       ? 'bg-[#fef9ec] text-[#b07800] border border-[#fde68a]'
                                       : 'bg-[#e0f0fe] text-indigo-600'}`}>
                      {c.author.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-ink">{c.author.name}</span>
                        {c.isInternal && (
                          <span className="text-xs bg-[#fef9ec] text-[#b07800] border border-[#fde68a]
                                           rounded-full px-2 py-0.5 font-medium">
                            Internal note
                          </span>
                        )}
                        <span className="text-xs text-ink-muted">{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-ink-soft whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add comment form */}
              {!terminal && (
                <div className="border-t border-[#f2f2f7] pt-4">
                  {isAgent && (
                    <label className="flex items-center gap-2 mb-2 cursor-pointer select-none w-fit">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={e => setIsInternal(e.target.checked)}
                        className="rounded border-hair text-[#b07800]"
                      />
                      <span className="text-sm text-ink-soft">Add as internal note</span>
                    </label>
                  )}

                  <textarea
                    value={commentBody}
                    onChange={e => setCommentBody(e.target.value)}
                    rows={3}
                    placeholder={isInternal
                      ? 'Internal note — only agents and admins will see this…'
                      : 'Add a comment…'}
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-ink resize-y
                                focus:outline-none focus:border-2
                                ${isInternal
                                  ? 'border-[#fde68a] bg-[#fef9ec] focus:border-[#b07800]'
                                  : 'border-hair focus:border-indigo-600'}`}
                  />

                  {isInternal && isAgent && (
                    <p className="mt-1 text-xs text-[#b07800] font-medium">
                      Internal — not visible to employee
                    </p>
                  )}

                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => {
                        if (commentBody.trim()) {
                          addCommentMutation.mutate({ body: commentBody.trim(), isInternal });
                        }
                      }}
                      disabled={!commentBody.trim() || addCommentMutation.isPending}
                      className={`px-4 py-2 rounded-lg text-white text-sm font-medium
                                  disabled:opacity-40
                                  ${isInternal
                                    ? 'bg-[#b07800] hover:bg-[#956500]'
                                    : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                      {addCommentMutation.isPending
                        ? 'Posting…'
                        : isInternal ? 'Post Internal Note' : 'Post Comment'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right column ─────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Agent Actions */}
            {isAgent && !terminal && (
              <div className="bg-white rounded-xl border border-hair p-5">
                <h2 className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-4">
                  Agent Actions
                </h2>

                <div className="space-y-4">
                  {dropdownOptions.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-ink-soft mb-1.5">
                        Move status to
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={moveToStatus}
                          onChange={e => setMoveToStatus(e.target.value)}
                          className="flex-1 rounded-lg border border-hair px-3 py-2 text-sm bg-white text-ink
                                     focus:outline-none focus:border-2 focus:border-indigo-600"
                        >
                          <option value="">Select…</option>
                          {dropdownOptions.map(s => (
                            <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            if (moveToStatus) transitionMutation.mutate({ toStatus: moveToStatus });
                          }}
                          disabled={!moveToStatus || transitionMutation.isPending}
                          className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                                     hover:bg-indigo-700 disabled:opacity-40"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}

                  {canHold && (
                    <div>
                      {!showOnHoldInput ? (
                        <button
                          onClick={() => setShowOnHoldInput(true)}
                          className="w-full px-3 py-2 rounded-lg border border-hair text-sm
                                     text-ink-soft text-left hover:bg-[#fafafa] font-medium"
                        >
                          Put On Hold…
                        </button>
                      ) : (
                        <div className="border border-hair rounded-lg p-3 bg-[#fafafa]">
                          <p className="text-xs font-medium text-ink-soft mb-1.5">
                            Reason for hold <span className="text-[#c0392b]">*</span>
                          </p>
                          <textarea
                            value={onHoldReason}
                            onChange={e => setOnHoldReason(e.target.value)}
                            rows={2}
                            placeholder="e.g. Awaiting customer response…"
                            className="w-full rounded border border-hair px-2 py-1.5 text-sm text-ink
                                       focus:outline-none focus:border-2 focus:border-indigo-600
                                       resize-none bg-white"
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => {
                                if (onHoldReason.trim()) {
                                  transitionMutation.mutate({ toStatus: 'ON_HOLD', reason: onHoldReason.trim() });
                                }
                              }}
                              disabled={!onHoldReason.trim() || transitionMutation.isPending}
                              className="flex-1 px-3 py-1.5 rounded bg-ink text-white text-xs
                                         font-medium hover:bg-ink-soft disabled:opacity-40"
                            >
                              {transitionMutation.isPending ? 'Saving…' : 'Confirm Hold'}
                            </button>
                            <button
                              onClick={() => { setShowOnHoldInput(false); setOnHoldReason(''); }}
                              className="px-3 py-1.5 rounded border border-hair text-xs text-ink-soft
                                         hover:bg-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {canResolve && (
                    <button
                      onClick={() => setShowResolveModal(true)}
                      className="w-full px-3 py-2 rounded-lg bg-[#1a7f4b] text-white text-sm font-medium
                                 hover:bg-[#166940]"
                    >
                      Resolve Ticket
                    </button>
                  )}

                  {transitionMutation.isError && (
                    <p className="text-xs text-[#c0392b] mt-1">
                      Transition failed. This may not be an allowed state change.
                    </p>
                  )}

                  {/* AI Assist */}
                  <div className="pt-3 border-t border-[#f2f2f7]">
                    <p className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-2
                                  flex items-center gap-1">
                      <svg className="w-3 h-3 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      AI Assist
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([
                        { action: 'summarise',        label: 'Summarise' },
                        { action: 'draft_reply',      label: 'Draft Reply' },
                        { action: 'suggest_fix',      label: 'Suggest Fix' },
                        { action: 'draft_kb_article', label: 'Draft KB Article' },
                      ] as const).map(({ action, label }) => {
                        const isThis = agentAssistMutation.isPending &&
                          agentAssistMutation.variables?.action === action;
                        return (
                          <button
                            key={action}
                            onClick={() => agentAssistMutation.mutate({
                              action,
                              summary:  `${ticket.subject}\n\n${ticket.description}`,
                              comments: ticket.comments.map(c => c.body),
                            })}
                            disabled={agentAssistMutation.isPending}
                            className="px-2 py-1.5 text-xs rounded-lg border border-[#b6d8ff]
                                       bg-[#e0f0fe] text-indigo-600 hover:bg-[#d0e8fd]
                                       disabled:opacity-40 font-medium text-left"
                          >
                            {isThis ? 'Working…' : label}
                          </button>
                        );
                      })}
                    </div>
                    {agentAssistMutation.isError && (
                      <p className="text-xs text-[#c0392b] mt-1">AI request failed. Is the AI service running?</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* AI Assist Result */}
            {aiResult && (
              <div className="bg-[#e0f0fe] border border-[#b6d8ff] rounded-xl p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <p className="text-[11px] font-medium text-indigo-600 uppercase tracking-[0.06em]">
                    {{
                      summarise:        'AI Summary',
                      draft_reply:      'Draft Reply',
                      suggest_fix:      'Suggested Fix',
                      draft_kb_article: 'KB Article Draft',
                    }[aiAction ?? ''] ?? 'AI Result'}
                  </p>
                  <button
                    onClick={() => setAiResult(null)}
                    className="text-ink-muted hover:text-ink shrink-0"
                    aria-label="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
                  {aiResult}
                </p>
                <button
                  onClick={() => navigator.clipboard.writeText(aiResult)}
                  className="mt-3 text-xs text-indigo-600 hover:underline font-medium"
                >
                  Copy to clipboard
                </button>
              </div>
            )}

            {/* Ticket Details */}
            <div className="bg-white rounded-xl border border-hair p-5">
              <h2 className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-4">
                Details
              </h2>
              <dl className="space-y-3">
                <InfoRow label="Status">
                  <Badge label={ticket.status} styleMap={STATUS_STYLES} />
                </InfoRow>
                <InfoRow label="Priority">
                  <Badge label={ticket.priority} styleMap={PRIORITY_STYLES} />
                </InfoRow>
                <InfoRow label="Category">{ticket.category?.name ?? '—'}</InfoRow>
                <InfoRow label="Requester">{ticket.requester.name}</InfoRow>
                <InfoRow label="Assignee">
                  {ticket.assignee ? ticket.assignee.name : (
                    <span className="text-ink-muted italic">Unassigned</span>
                  )}
                </InfoRow>
                <InfoRow label="Source">{ticket.source}</InfoRow>
                {ticket.slaResolutionDue && (
                  <InfoRow label="SLA Due">
                    <span className="text-sm tabular-nums">{formatDate(ticket.slaResolutionDue)}</span>
                  </InfoRow>
                )}
                <InfoRow label="Updated">{formatDate(ticket.updatedAt)}</InfoRow>
              </dl>
            </div>

            {/* Status Timeline */}
            {ticket.statusHistory.length > 0 && (
              <div className="bg-white rounded-xl border border-hair p-5">
                <h2 className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-4">
                  Status History
                </h2>
                <ol className="relative border-l border-hair ml-3 space-y-4">
                  {[...ticket.statusHistory].reverse().map(entry => (
                    <li key={entry.id} className="ml-4">
                      <div className="absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full
                                      bg-indigo-600 border-2 border-white" />
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.fromStatus && (
                          <>
                            <Badge label={entry.fromStatus} styleMap={STATUS_STYLES} />
                            <span className="text-ink-muted text-xs">→</span>
                          </>
                        )}
                        <Badge label={entry.toStatus} styleMap={STATUS_STYLES} />
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5">
                        by {entry.actor?.name ?? 'System'} · {formatDate(entry.createdAt)}
                      </p>
                      {entry.reason && (
                        <p className="text-xs text-ink-muted mt-0.5 italic">"{entry.reason}"</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      </Layout>
    </>
  );
}
