import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { useAuth } from '../../auth/useAuth';

interface Actor {
  id: string;
  name: string;
  email: string;
}

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
  actor: Actor;
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
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
  statusHistory: StatusHistoryEntry[];
}

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
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

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

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [commentBody, setCommentBody] = useState('');
  const isEmployee = user?.roles.every(r => r === 'EMPLOYEE');

  const { data: ticket, isLoading, isError } = useQuery<Ticket>({
    queryKey: ['ticket', id],
    queryFn: () => api.get<Ticket>(`/tickets/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const addCommentMutation = useMutation({
    mutationFn: (body: string) =>
      api.post(`/tickets/${id}/comments`, { body, isInternal: false }).then(r => r.data),
    onSuccess: () => {
      setCommentBody('');
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: (toStatus: string) =>
      api.post(`/tickets/${id}/transition`, { toStatus }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
  });

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

  const visibleComments = isEmployee
    ? ticket.comments.filter(c => !c.isInternal)
    : ticket.comments;

  return (
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
        <div>
          <h1 className="text-xl font-bold text-gray-900">{ticket.subject}</h1>
          <p className="text-xs text-gray-400 mt-0.5">Opened {formatDate(ticket.createdAt)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: main content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Description card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Description
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {ticket.description}
            </p>
          </div>

          {/* Confirm Resolution button (EMPLOYEE, status = RESOLVED) */}
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
                onClick={() => transitionMutation.mutate('CLOSED')}
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
                <div key={c.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center
                                  justify-center text-xs font-bold shrink-0">
                    {c.author.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-800">{c.author.name}</span>
                      {c.isInternal && (
                        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200
                                         rounded px-1.5 py-0.5 font-medium">
                          Internal
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add comment */}
            <div className="border-t border-gray-100 pt-4">
              <textarea
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                rows={3}
                placeholder="Add a comment…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                           resize-y"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => {
                    if (commentBody.trim()) addCommentMutation.mutate(commentBody.trim());
                  }}
                  disabled={!commentBody.trim() || addCommentMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                             hover:bg-indigo-700 transition-colors disabled:opacity-40"
                >
                  {addCommentMutation.isPending ? 'Posting…' : 'Post Comment'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: metadata + timeline */}
        <div className="space-y-6">

          {/* Ticket details */}
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
                      by {entry.actor.name} · {formatDate(entry.createdAt)}
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
  );
}
