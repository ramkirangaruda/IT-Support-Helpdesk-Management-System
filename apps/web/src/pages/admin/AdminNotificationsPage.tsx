import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface NotificationRecord {
  id:             string;
  recipientEmail: string;
  event:          string;
  status:         string;
  retryCount:     number;
  createdAt:      string;
  ticket:         { id: string; subject: string } | null;
}

const STATUS_OPTIONS = ['FAILED', 'PENDING', 'SENT'] as const;
type StatusFilter = typeof STATUS_OPTIONS[number];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_BADGE: Record<string, string> = {
  FAILED:  'bg-[#fff1f2] text-[#c0392b] border-[#fecdd3]',
  PENDING: 'bg-[#fef9ec] text-[#b07800] border-[#f0d870]',
  SENT:    'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]',
};

function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-hair overflow-hidden animate-pulse">
      <div className="border-b border-hair h-10" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-6 px-4 py-3.5 border-b border-[#f2f2f7] last:border-0">
          <div className="h-4 w-36 bg-[#f2f2f7] rounded" />
          <div className="h-4 w-28 bg-[#f2f2f7] rounded" />
          <div className="h-4 w-16 bg-[#f2f2f7] rounded" />
          <div className="h-4 w-12 bg-[#f2f2f7] rounded" />
        </div>
      ))}
    </div>
  );
}

export default function AdminNotificationsPage() {
  const [status, setStatus] = useState<StatusFilter>('SENT');

  const { data = [], isLoading, refetch } = useQuery<NotificationRecord[]>({
    queryKey: ['admin-notifications', status],
    queryFn: () =>
      api.get<NotificationRecord[]>('/admin/notifications', {
        params: { status, limit: 100 },
      }).then(r => r.data),
    refetchInterval: 30_000,
  });

  return (
    <Layout>
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Notification Log</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            In-app notification records · refreshes every 30 s
          </p>
        </div>
        <div className="flex items-center gap-2">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                ${status === s
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-hair text-ink-soft hover:bg-[#fafafa]'}`}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => void refetch()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-hair
                       text-ink-soft hover:bg-[#fafafa]"
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-3">
          <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p className="text-sm font-medium">No {status.toLowerCase()} notifications</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-hair overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-hair">
                {['Recipient', 'Event', 'Ticket', 'Status', 'Retries', 'Created'].map(h => (
                  <th key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                               uppercase tracking-[0.06em] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f2f7]">
              {data.map(n => (
                <tr key={n.id} className="hover:bg-[#fafafa]">
                  <td className="px-4 py-3.5 text-xs text-ink-muted">{n.recipientEmail}</td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-xs text-ink-soft">{n.event}</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs">
                    {n.ticket
                      ? <span className="ticket-id">{n.ticket.id}</span>
                      : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
                      ${STATUS_BADGE[n.status] ?? 'bg-[#f2f2f7] text-[#6e6e73] border-hair'}`}>
                      {n.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink-muted text-center tabular-nums">{n.retryCount}</td>
                  <td className="px-4 py-3.5 text-xs text-ink-muted whitespace-nowrap">{formatDate(n.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-hair text-xs text-ink-muted">
            Showing {data.length} record{data.length !== 1 ? 's' : ''} · status: {status}
          </div>
        </div>
      )}
    </Layout>
  );
}
