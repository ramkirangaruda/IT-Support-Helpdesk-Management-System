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
  FAILED:  'bg-red-50 text-red-700 border-red-200',
  PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  SENT:    'bg-green-50 text-green-700 border-green-200',
};

export default function AdminNotificationsPage() {
  const [status, setStatus] = useState<StatusFilter>('FAILED');

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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Notification Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Email and in-app notification records · refreshes every 30 s
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
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => void refetch()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300
                       bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : data.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm font-medium text-gray-500">No {status.toLowerCase()} notifications</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Recipient', 'Event', 'Ticket', 'Status', 'Retries', 'Created'].map(h => (
                  <th key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map(n => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 text-xs">{n.recipientEmail}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-600">{n.event}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {n.ticket ? (
                      <span className="text-indigo-600 font-mono">{n.ticket.id}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border
                      ${STATUS_BADGE[n.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {n.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 text-center">{n.retryCount}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(n.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            Showing {data.length} record{data.length !== 1 ? 's' : ''} · status: {status}
          </div>
        </div>
      )}
    </Layout>
  );
}
