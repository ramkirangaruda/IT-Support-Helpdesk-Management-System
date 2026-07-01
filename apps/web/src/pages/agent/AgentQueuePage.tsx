import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { computeSlaPercent, formatSlaRemaining, slaColor, type SlaFields } from '../../lib/sla';

interface TicketRow extends SlaFields {
  id:       string;
  subject:  string;
  priority: string;
  status:   string;
  category: { id: string; name: string } | null;
}

interface TicketsResponse { data: TicketRow[]; total: number }

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const TERMINAL = new Set(['CLOSED', 'CANCELLED']);

const STATUS_STYLES: Record<string, string> = {
  NEW:         'bg-[#f2f2f7] text-[#6e6e73]',
  ASSIGNED:    'bg-[#e0f0fe] text-[#0071e3]',
  IN_PROGRESS: 'bg-[#eef0fb] text-[#3b5cc3]',
  ON_HOLD:     'bg-[#fef9ec] text-[#b07800]',
  ESCALATED:   'bg-[#fff2ea] text-[#b45309]',
  RESOLVED:    'bg-[#eafaf3] text-[#1a7f4b]',
  REOPENED:    'bg-[#f5f0fd] text-[#7c3aed]',
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW:      'bg-[#f2f2f7] text-[#6e6e73]',
  MEDIUM:   'bg-[#e0f0fe] text-[#0071e3]',
  HIGH:     'bg-[#fff2ea] text-[#b45309]',
  CRITICAL: 'bg-[#fff1f2] text-[#c0392b]',
};

function Badge({ label, styleMap }: { label: string; styleMap: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${styleMap[label] ?? 'bg-[#f2f2f7] text-[#6e6e73]'}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function SlaBar({ ticket }: { ticket: SlaFields }) {
  const pct   = computeSlaPercent(ticket);
  const color = slaColor(pct);
  const barCls = color === 'green'  ? 'bg-[#1a7f4b]'
    : color === 'yellow' ? 'bg-[#b07800]'
    : color === 'red'    ? 'bg-[#c0392b]'
    : 'bg-[#d2d2d7]';

  if (pct === null) return <span className="text-xs text-ink-muted">No SLA</span>;

  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <div className="flex-1 h-1 bg-[#f2f2f7] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      <span className={`text-xs font-medium w-12 text-right tabular-nums
        ${color === 'green' ? 'text-[#1a7f4b]' : color === 'yellow' ? 'text-[#b07800]' : 'text-[#c0392b]'}`}>
        {pct <= 0 ? 'Breached' : `${Math.round(pct)}%`}
      </span>
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <tr className="border-b border-[#f2f2f7] animate-pulse">
      {[24, 20, 44, 20, 16, 16, 20].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className={`h-4 bg-[#f2f2f7] rounded w-${w}`} />
        </td>
      ))}
    </tr>
  );
}

export default function AgentQueuePage() {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<TicketsResponse>({
    queryKey: ['agent-queue'],
    queryFn:  () =>
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Agent Queue</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Tickets assigned to you — sorted by SLA urgency
          </p>
        </div>
        {!isLoading && (
          <span className="text-sm text-ink-muted">
            {tickets.length} active ticket{tickets.length !== 1 ? 's' : ''}
          </span>
        )}
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
                {['SLA', 'Ticket ID', 'Subject', 'Category', 'Priority', 'Status', 'SLA Due'].map(h => (
                  <th key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                               uppercase tracking-[0.06em] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f2f7]">
              {isLoading && Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} />)}

              {!isLoading && tickets.map(ticket => {
                const pct       = computeSlaPercent(ticket);
                const isBreached = pct !== null && pct <= 0;
                return (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                    className={`cursor-pointer
                                ${isBreached
                                  ? 'border-l-2 border-l-[#c0392b] bg-[#fff7f7] hover:bg-[#fff1f2]'
                                  : 'hover:bg-[#fafafa]'}`}
                  >
                    <td className="px-4 py-3.5 w-40">
                      <SlaBar ticket={ticket} />
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="ticket-id">{ticket.id}</span>
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <span className="font-medium text-ink line-clamp-1">{ticket.subject}</span>
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
                    <td className={`px-4 py-3.5 text-xs whitespace-nowrap font-medium
                                    ${isBreached ? 'text-[#c0392b]' : 'text-ink-muted'}`}>
                      {formatSlaRemaining(ticket.slaResolutionDue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!isLoading && !isError && tickets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-3">
            <svg className="w-12 h-12 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">Queue is clear</p>
            <p className="text-xs">No active tickets assigned to you</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
