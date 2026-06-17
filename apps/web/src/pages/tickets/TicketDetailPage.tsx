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
  id: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author: Actor;
}

interface StatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  createdAt: string;
  actor: Actor | null;
}

interface Ticket {
  id: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  source: string;
  category: { id: string; name: string } | null;
  requester: Actor;
  assignee: Actor | null;
  slaResolutionDue: string | null;
  slaResponseDue: string | null;
  slaPausedMs: number;
  pausedAt: string | null;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
  statusHistory: StatusHistoryEntry[];
}

// ── Style maps ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700 border border-blue-200',
  OPEN: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  IN_PROGRESS: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  ON_HOLD: 'bg-gray-100 text-gray-600 border border-gray-200',
  RESOLVED: 'bg-green-50 text-green-700 border border-green-200',
  CLOSED: 'bg-gray-100 text-gray-500 border border-gray-200',
  CANCELLED: 'bg-red-50 text-red-600 border border-red-200',
  ESCALATED: 'bg-purple-50 text-purple-700 border border-purple-200',
  REOPENED: 'bg-orange-50 text-orange-700 border border-orange-200',
  ASSIGNED: 'bg-blue-50 text-blue-600 border border-blue-200',
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

// ── Small reusable components ─────────────────────────────────────────────────

function Badge({ label, styleMap }: { label: string; styleMap: Record<string, string> }) {
  const cls = styleMap[label] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
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
      <dt className="w-36 shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-gray-800">{children}</dd>
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
  onCancel: () => void;
  isPending: boolean;
}) {
  const [summary, setSummary] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-xl border border-gray-200 p-6">
        <h2 className="text-base font-bold text-gray-900 mb-1">Resolve Ticket</h2>
        <p className="text-sm text-gray-500 mb-4">
          Provide a resolution summary before marking this ticket as resolved.
        </p>
        <textarea
          value={summary}
          onChange={e => setSummary(e.target.value)}
          rows={5}
          placeholder="Describe how the issue was resolved…"
          autoFocus
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
                     resize-y mb-4"
        />
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                       hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => summary.trim() && onConfirm(summary.trim())}
            disabled={!summary.trim() || isPending}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium
                       hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Resolving…' : 'Mark Resolved'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const AGENT_ROLES = new Set(['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN']);
// Statuses with dedicated buttons — excluded from the generic "Move Status" dropdown
const SPECIAL_TRANSITIONS = new Set(['ON_HOLD', 'RESOLVED']);

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isEmployee = user?.roles.every(r => r === 'EMPLOYEE');
  const isAgent = user?.roles.some(r => AGENT_ROLES.has(r));

  // Comment state
  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  // Agent action state
  const [moveToStatus, setMoveToStatus] = useState('');
  const [showOnHoldInput, setShowOnHoldInput] = useState(false);
  const [onHoldReason, setOnHoldReason] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);

  // ── Queries & mutations ───────────────────────────────────────────────────

  const { data: ticket, isLoading, isError } = useQuery<Ticket>({
    queryKey: ['ticket', id],
    queryFn: () => api.get<Ticket>(`/tickets/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ticket', id] });

  const addCommentMutation = useMutation({
    mutationFn: (vars: { body: string; isInternal: boolean }) =>
      api.post(`/tickets/${id}/comments`, vars).then(r => r.data),
    onSuccess: () => {
      setCommentBody('');
      setIsInternal(false);
      invalidate();
    },
  });

  const transitionMutation = useMutation({
    mutationFn: (vars: { toStatus: string; reason?: string }) =>
      api.post(`/tickets/${id}/transition`, vars).then(r => r.data),
    onSuccess: () => {
      setMoveToStatus('');
      setShowOnHoldInput(false);
      setOnHoldReason('');
      invalidate();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (resolutionSummary: string) =>
      api.post(`/tickets/${id}/resolve`, { resolutionSummary }).then(r => r.data),
    onSuccess: () => {
      setShowResolveModal(false);
      invalidate();
    },
  });

  // ── Loading / error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32 text-gray-400 text-sm">
          Loading ticket…
        </div>
      </Layout>
    );
  }

  if (isError || !ticket) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 text-gray-400">
          <p className="text-sm font-medium text-red-500">Ticket not found or failed to load.</p>
          <Link to="/tickets" className="mt-3 text-sm text-indigo-600 hover:underline">
            ← Back to tickets
          </Link>
        </div>
      </Layout>
    );
  }

  const allowed = allowedTransitions(ticket.status);
  const canHold    = allowed.includes('ON_HOLD');
  const canResolve = allowed.includes('RESOLVED');
  const dropdownOptions = allowed.filter(s => !SPECIAL_TRANSITIONS.has(s));
  const terminal = isTerminal(ticket.status);

  const visibleComments = isEmployee
    ? ticket.comments.filter(c => !c.isInternal)
    : ticket.comments;

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
        <div className="mb-4">
          <Link to="/tickets" className="text-sm text-indigo-600 hover:underline">
            ← Back to tickets
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50
                           border border-indigo-200 rounded px-2 py-1 mt-0.5 shrink-0">
            {ticket.id}
          </span>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{ticket.subject}</h1>
            <p className="text-xs text-gray-400 mt-0.5">Opened {formatDate(ticket.createdAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column ──────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Description */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Description
              </h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {ticket.description}
              </p>
            </div>

            {/* Confirm Resolution (EMPLOYEE only) */}
            {isEmployee && ticket.status === 'RESOLVED' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center
                              justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-green-800">Issue resolved?</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    Confirm that your issue has been resolved to close this ticket.
                  </p>
                </div>
                <button
                  onClick={() => transitionMutation.mutate({ toStatus: 'CLOSED' })}
                  disabled={transitionMutation.isPending}
                  className="shrink-0 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium
                             hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {transitionMutation.isPending ? 'Closing…' : 'Confirm Resolution'}
                </button>
              </div>
            )}

            {/* Comments */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                Comments {visibleComments.length > 0 && `(${visibleComments.length})`}
              </h2>

              {visibleComments.length === 0 && (
                <p className="text-sm text-gray-400 mb-4">No comments yet.</p>
              )}

              <div className="space-y-4 mb-5">
                {visibleComments.map(c => (
                  <div
                    key={c.id}
                    className={`flex gap-3 rounded-lg p-3 -mx-1
                                ${c.isInternal ? 'bg-amber-50 border border-amber-100' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center
                                     text-xs font-bold shrink-0
                                     ${c.isInternal
                                       ? 'bg-amber-100 text-amber-700'
                                       : 'bg-indigo-100 text-indigo-600'}`}>
                      {c.author.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{c.author.name}</span>
                        {c.isInternal && (
                          <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200
                                           rounded px-1.5 py-0.5 font-medium">
                            Internal — not visible to employee
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add comment form */}
              {!terminal && (
                <div className="border-t border-gray-100 pt-4">
                  {/* Internal toggle (agents only) */}
                  {isAgent && (
                    <label className="flex items-center gap-2 mb-2 cursor-pointer select-none w-fit">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={e => setIsInternal(e.target.checked)}
                        className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm text-gray-600">Add as internal note</span>
                    </label>
                  )}

                  <textarea
                    value={commentBody}
                    onChange={e => setCommentBody(e.target.value)}
                    rows={3}
                    placeholder={isInternal ? 'Internal note — only agents and admins will see this…' : 'Add a comment…'}
                    className={`w-full rounded-lg border px-3 py-2 text-sm resize-y
                                focus:outline-none focus:ring-2 focus:border-transparent
                                ${isInternal
                                  ? 'border-amber-300 bg-amber-50 focus:ring-amber-400'
                                  : 'border-gray-300 focus:ring-indigo-500'}`}
                  />

                  {isInternal && isAgent && (
                    <p className="mt-1 text-xs text-amber-600 font-medium">
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
                      className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors
                                  disabled:opacity-40
                                  ${isInternal
                                    ? 'bg-amber-600 hover:bg-amber-700'
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
          <div className="space-y-6">

            {/* Agent Actions */}
            {isAgent && !terminal && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Agent Actions
                  </h2>
                  {/* AI Assist stub */}
                  <button
                    onClick={() => alert('AI Assist coming in Phase 2')}
                    className="flex items-center gap-1 text-xs text-indigo-600 border border-indigo-200
                               bg-indigo-50 rounded px-2 py-1 hover:bg-indigo-100 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AI Assist
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Move Status dropdown */}
                  {dropdownOptions.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Move status to
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={moveToStatus}
                          onChange={e => setMoveToStatus(e.target.value)}
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                                     hover:bg-indigo-700 transition-colors disabled:opacity-40"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Put On Hold */}
                  {canHold && (
                    <div>
                      {!showOnHoldInput ? (
                        <button
                          onClick={() => setShowOnHoldInput(true)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
                                     text-gray-700 text-left hover:bg-gray-50 transition-colors font-medium"
                        >
                          Put On Hold…
                        </button>
                      ) : (
                        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                          <p className="text-xs font-medium text-gray-600 mb-1.5">
                            Reason for hold <span className="text-red-500">*</span>
                          </p>
                          <textarea
                            value={onHoldReason}
                            onChange={e => setOnHoldReason(e.target.value)}
                            rows={2}
                            placeholder="e.g. Awaiting customer response…"
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm
                                       focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent
                                       resize-none bg-white"
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => {
                                if (onHoldReason.trim()) {
                                  transitionMutation.mutate({
                                    toStatus: 'ON_HOLD',
                                    reason: onHoldReason.trim(),
                                  });
                                }
                              }}
                              disabled={!onHoldReason.trim() || transitionMutation.isPending}
                              className="flex-1 px-3 py-1.5 rounded bg-gray-700 text-white text-xs
                                         font-medium hover:bg-gray-800 transition-colors disabled:opacity-40"
                            >
                              {transitionMutation.isPending ? 'Saving…' : 'Confirm Hold'}
                            </button>
                            <button
                              onClick={() => { setShowOnHoldInput(false); setOnHoldReason(''); }}
                              className="px-3 py-1.5 rounded border border-gray-300 text-xs text-gray-600
                                         hover:bg-white transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Resolve */}
                  {canResolve && (
                    <button
                      onClick={() => setShowResolveModal(true)}
                      className="w-full px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium
                                 hover:bg-green-700 transition-colors"
                    >
                      Resolve Ticket
                    </button>
                  )}

                  {transitionMutation.isError && (
                    <p className="text-xs text-red-600 mt-1">
                      Transition failed. This may not be an allowed state change.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Ticket Details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
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
                    <span className="text-gray-400 italic">Unassigned</span>
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
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                  Status History
                </h2>
                <ol className="relative border-l border-gray-200 ml-3 space-y-4">
                  {[...ticket.statusHistory].reverse().map(entry => (
                    <li key={entry.id} className="ml-4">
                      <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-indigo-400 border-2 border-white" />
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.fromStatus && (
                          <>
                            <Badge label={entry.fromStatus} styleMap={STATUS_STYLES} />
                            <span className="text-gray-400 text-xs">→</span>
                          </>
                        )}
                        <Badge label={entry.toStatus} styleMap={STATUS_STYLES} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        by {entry.actor?.name ?? 'System'} · {formatDate(entry.createdAt)}
                      </p>
                      {entry.reason && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">"{entry.reason}"</p>
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
