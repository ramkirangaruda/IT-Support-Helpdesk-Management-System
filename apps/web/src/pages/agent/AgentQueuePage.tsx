import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { computeSlaPercent, formatSlaRemaining, type SlaFields } from '../../lib/sla';

interface TicketRow extends SlaFields {
  id: string;
  subject: string;
  priority: string;
  status: string;
  category: { id: string; name: string } | null;
}

interface TicketsResponse {
  data: TicketRow[];
  total: number;
}

const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const TERMINAL = new Set(['CLOSED', 'CANCELLED']);

function SlaIndicator({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-gray-400">No SLA</span>;
  }

  let barColor: string;
  let label: string;
  let textColor: string;

  if (pct > 50) {
    barColor = 'bg-green-500';
    textColor = 'text-green-700';
    label = `${Math.round(pct)}%`;
  } else if (pct > 25) {
    barColor = 'bg-yellow-400';
    textColor = 'text-yellow-700';
    label = `${Math.round(pct)}%`;
  } else if (pct > 0) {
    barColor = 'bg-red-500';
    textColor = 'text-red-700';
    label = `${Math.round(pct)}%`;
  } else {
    barColor = 'bg-red-600';
    textColor = 'text-red-700';
    label = 'Breached';
  }

  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      <span className={`text-xs font-semibold ${textColor} w-14 text-right`}>{label}</span>
    </div>
  );
}


const STATUS_STYLES: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700 border border-blue-200',
  OPEN: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  IN_PROGRESS: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  ON_HOLD: 'bg-gray-100 text-gray-600 border border-gray-200',
  RESOLVED: 'bg-green-50 text-green-700 border border-green-200',
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

export default function AgentQueuePage() {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<TicketsResponse>({
    queryKey: ['agent-queue'],
    queryFn: () =>
      api.get<TicketsResponse>('/tickets', { params: { limit: 100 } }).then(r => r.data),
    refetchInterval: 60_000,
  });

  const tickets = (data?.data ?? [])
    .filter(t => !TERMINAL.has(t.status))
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      if (!a.slaResolutionDue) return 1;
      if (!b.slaResolutionDue) return -1;
      return new Date(a.slaResolutionDue).getTime() - new Date(b.slaResolutionDue).getTime();
    });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tickets assigned to you — sorted by SLA urgency
          </p>
        </div>
        {data && (
          <span className="text-sm text-gray-500">
            {tickets.length} active ticket{tickets.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            Loading queue…
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center py-20 text-red-500 text-sm">
            Failed to load tickets. Please try again.
          </div>
        )}

        {!isLoading && !isError && tickets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">Queue is clear</p>
            <p className="text-xs mt-1">No active tickets assigned to you</p>
          </div>
        )}

        {tickets.length > 0 && (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['SLA', 'Ticket ID', 'Subject', 'Category', 'Priority', 'Status', 'SLA Due'].map(h => (
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
              {tickets.map(ticket => {
                const pct = computeSlaPercent(ticket);
                const isBreached = pct !== null && pct <= 0;
                return (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                    className={`cursor-pointer transition-colors hover:bg-gray-50
                               ${isBreached ? 'bg-red-50 hover:bg-red-100' : ''}`}
                  >
                    <td className="px-4 py-3 w-40">
                      <SlaIndicator pct={pct} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
                      {ticket.id}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="font-medium text-gray-900 line-clamp-1">{ticket.subject}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {ticket.category?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold
                                        ${PRIORITY_STYLES[ticket.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold
                                        ${STATUS_STYLES[ticket.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ticket.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs whitespace-nowrap font-medium
                                    ${isBreached ? 'text-red-600' : 'text-gray-500'}`}>
                      {formatSlaRemaining(ticket.slaResolutionDue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
