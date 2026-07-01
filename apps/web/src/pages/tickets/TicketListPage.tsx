import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { useAuth } from '../../auth/useAuth';
import Pagination from '../../components/Pagination';

interface TicketSummary {
  id:        string;
  subject:   string;
  priority:  string;
  status:    string;
  category:  { id: string; name: string } | null;
  requester: { id: string; name: string; email: string };
  assignee:  { id: string; name: string; email: string } | null;
  createdAt: string;
}

interface TicketsResponse {
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
  data:       TicketSummary[];
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW:      'bg-[#f2f2f7] text-[#6e6e73]',
  MEDIUM:   'bg-[#e0f0fe] text-[#0071e3]',
  HIGH:     'bg-[#fff2ea] text-[#b45309]',
  CRITICAL: 'bg-[#fff1f2] text-[#c0392b]',
};

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

function Badge({ label, styleMap }: { label: string; styleMap: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${styleMap[label] ?? 'bg-[#f2f2f7] text-[#6e6e73]'}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function TableRowSkeleton() {
  return (
    <tr className="border-b border-[#f2f2f7] animate-pulse">
      {[20, 44, 20, 16, 20, 20].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className={`h-4 bg-[#f2f2f7] rounded w-${w}`} />
        </td>
      ))}
    </tr>
  );
}

export default function TicketListPage() {
  const { user } = useAuth();
  const isEmployee = user?.roles.every(r => r === 'EMPLOYEE');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isError } = useQuery<TicketsResponse>({
    queryKey: ['my-tickets', page],
    queryFn: () =>
      api.get<TicketsResponse>('/tickets', { params: { page, limit, raisedByMe: true } }).then(r => r.data),
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">
            {isEmployee ? 'My Tickets' : 'All Tickets'}
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {isEmployee
              ? 'Support requests you have raised'
              : 'All tickets visible to your role'}
          </p>
        </div>
        <Link
          to="/tickets/new"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg
                     bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          + New Ticket
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-hair overflow-hidden">
        {isError && (
          <div className="flex items-center justify-center py-20 text-[#c0392b] text-sm">
            Failed to load tickets. Please try again.
          </div>
        )}

        {!isError && (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-hair">
                {['Ticket ID', 'Subject', 'Category', 'Priority', 'Status', 'Created'].map(h => (
                  <th key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                               uppercase tracking-[0.06em] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f2f7]">
              {isLoading && Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} />)}

              {!isLoading && data?.data.map(ticket => (
                <tr key={ticket.id} className="hover:bg-[#fafafa]">
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Link to={`/tickets/${ticket.id}`}>
                      <span className="ticket-id">{ticket.id}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 max-w-xs">
                    <Link
                      to={`/tickets/${ticket.id}`}
                      className="font-medium text-ink hover:text-indigo-600 line-clamp-1"
                    >
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                    {ticket.category?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge label={ticket.priority} styleMap={PRIORITY_STYLES} />
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge label={ticket.status} styleMap={STATUS_STYLES} />
                  </td>
                  <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                    {formatDate(ticket.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Empty state */}
        {!isLoading && !isError && data?.data.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-3">
            <svg className="w-12 h-12 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2
                   M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-medium">No tickets yet</p>
            <p className="text-xs">Submit a new request to get started</p>
          </div>
        )}

        {/* Pagination */}
        {data && (data.totalPages ?? 1) > 1 && (
          <div className="px-4 pb-4 border-t border-[#f2f2f7] pt-3">
            <Pagination
              page={page}
              totalPages={data.totalPages}
              total={data.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
