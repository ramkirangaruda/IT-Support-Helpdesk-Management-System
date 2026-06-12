import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { useAuth } from '../../auth/useAuth';

interface TicketSummary {
  id: string;
  subject: string;
  priority: string;
  status: string;
  category: { id: string; name: string } | null;
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
  createdAt: string;
}

interface TicketsResponse {
  total: number;
  page: number;
  limit: number;
  data: TicketSummary[];
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

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

function Badge({ label, styleMap }: { label: string; styleMap: Record<string, string> }) {
  const cls = styleMap[label] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function TicketListPage() {
  const { user } = useAuth();
  const isEmployee = user?.roles.every(r => r === 'EMPLOYEE');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isError } = useQuery<TicketsResponse>({
    queryKey: ['tickets', page],
    queryFn: () =>
      api.get<TicketsResponse>('/tickets', { params: { page, limit } }).then(r => r.data),
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEmployee ? 'My Tickets' : 'All Tickets'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isEmployee
              ? 'Support requests you have raised'
              : 'All tickets visible to your role'}
          </p>
        </div>
        <Link
          to="/tickets/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                     bg-indigo-600 text-white text-sm font-medium
                     hover:bg-indigo-700 transition-colors"
        >
          <span>+</span> New Ticket
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            Loading tickets…
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-20 text-red-500 text-sm">
            Failed to load tickets. Please try again.
          </div>
        )}

        {data && data.data.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-medium">No tickets yet</p>
            <p className="text-xs mt-1">Submit a new request to get started</p>
          </div>
        )}

        {data && data.data.length > 0 && (
          <>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Ticket ID', 'Subject', 'Category', 'Priority', 'Status', 'Created'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.data.map(ticket => (
                  <tr key={ticket.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono">
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className="text-indigo-600 hover:underline font-semibold text-xs"
                      >
                        {ticket.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className="text-gray-900 hover:text-indigo-600 font-medium line-clamp-1"
                      >
                        {ticket.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{ticket.category?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge label={ticket.priority} styleMap={PRIORITY_STYLES} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={ticket.status} styleMap={STATUS_STYLES} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatDate(ticket.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data.total > limit && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-xs text-gray-500">
                  {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} of {data.total}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40
                               hover:bg-white transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page * limit >= data.total}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40
                               hover:bg-white transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
