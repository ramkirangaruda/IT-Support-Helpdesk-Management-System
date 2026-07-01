import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';
import { computeSlaPercent, formatSlaRemaining, slaColor, type SlaFields } from '../../lib/sla';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent    { id: string; name: string; email: string }
interface Category { id: string; name: string }

interface TicketRow extends SlaFields {
  id:        string;
  subject:   string;
  priority:  string;
  status:    string;
  category:  { id: string; name: string } | null;
  assignee:  { id: string; name: string; email: string } | null;
  requester: { id: string; name: string; email: string };
  createdAt: string;
}

interface TicketsResponse {
  data:       TicketRow[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

interface Stats {
  totalOpen:   number;
  new:         number;
  assigned:    number;
  inProgress:  number;
  escalated:   number;
  breachedSla: number;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  NEW:         'bg-[#f2f2f7] text-[#6e6e73]',
  ASSIGNED:    'bg-[#e0f0fe] text-[#0071e3]',
  IN_PROGRESS: 'bg-[#eef0fb] text-[#3b5cc3]',
  ON_HOLD:     'bg-[#fef9ec] text-[#b07800]',
  ESCALATED:   'bg-[#fff2ea] text-[#b45309]',
  RESOLVED:    'bg-[#eafaf3] text-[#1a7f4b]',
  CLOSED:      'bg-[#f2f2f7] text-[#86868b]',
  CANCELLED:   'bg-[#fff1f2] text-[#c0392b]',
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ── SLA bar ───────────────────────────────────────────────────────────────────

function SlaBar({ ticket }: { ticket: SlaFields }) {
  const pct   = computeSlaPercent(ticket);
  const color = slaColor(pct);
  const barCls = color === 'green'  ? 'bg-[#1a7f4b]'
    : color === 'yellow' ? 'bg-[#b07800]'
    : color === 'red'    ? 'bg-[#c0392b]'
    : 'bg-[#d2d2d7]';

  if (pct === null) return <span className="text-xs text-ink-muted">—</span>;

  return (
    <div className="flex items-center gap-1.5 min-w-[90px]">
      <div className="flex-1 h-1 bg-[#f2f2f7] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      <span className={`text-xs font-medium w-10 text-right tabular-nums
        ${color === 'green' ? 'text-[#1a7f4b]' : color === 'yellow' ? 'text-[#b07800]' : 'text-[#c0392b]'}`}>
        {pct <= 0 ? 'Over' : `${Math.round(pct)}%`}
      </span>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, highlight,
}: {
  label:      string;
  value:      number | undefined;
  highlight?: 'red' | 'orange' | 'yellow';
}) {
  const borderCls = highlight === 'red'
    ? 'border-l-2 border-l-[#c0392b] border-t border-r border-b border-hair'
    : highlight === 'orange'
    ? 'border-l-2 border-l-[#d4660c] border-t border-r border-b border-hair'
    : highlight === 'yellow'
    ? 'border-l-2 border-l-[#b07800] border-t border-r border-b border-hair'
    : 'border border-hair';
  const numCls = highlight === 'red'    ? 'text-[#c0392b]'
    : highlight === 'orange'  ? 'text-[#d4660c]'
    : highlight === 'yellow'  ? 'text-[#b07800]'
    : 'text-ink';

  return (
    <div className={`bg-white rounded-xl ${borderCls} p-5 flex flex-col gap-1`}>
      <span className={`text-[22px] font-semibold tabular-nums leading-none ${numCls}`}>
        {value ?? '—'}
      </span>
      <span className="text-xs font-medium text-ink-muted mt-1">{label}</span>
    </div>
  );
}

// ── Inline assign panel ───────────────────────────────────────────────────────

function AssignPanel({
  ticketId, currentPriority, agents, categories, onSuccess, onCancel,
}: {
  ticketId:        string;
  currentPriority: string;
  agents:          Agent[];
  categories:      Category[];
  onSuccess:       () => void;
  onCancel:        () => void;
}) {
  const [assigneeId,  setAssigneeId]  = useState('');
  const [priority,    setPriority]    = useState('');
  const [categoryId,  setCategoryId]  = useState('');

  const queryClient = useQueryClient();
  const selectCls   = `rounded-lg border border-hair px-3 py-2 text-sm bg-white text-ink
                        focus:outline-none focus:border-2 focus:border-indigo-600`;

  const assignMutation = useMutation({
    mutationFn: () =>
      api.post(`/tickets/${ticketId}/assign`, {
        assigneeId,
        ...(priority   && { priority }),
        ...(categoryId && { categoryId }),
      }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-triage'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-stats'] });
      onSuccess();
    },
  });

  return (
    <div className="p-4 bg-[#fafafa] border-t border-hair">
      <div className="max-w-2xl flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-ink-soft mb-1">
            Assign to <span className="text-[#c0392b]">*</span>
          </label>
          <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={selectCls}>
            <option value="">Select agent…</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.email})</option>)}
          </select>
        </div>
        <div className="min-w-[130px]">
          <label className="block text-xs font-medium text-ink-soft mb-1">
            Priority <span className="text-ink-muted font-normal">(optional)</span>
          </label>
          <select value={priority} onChange={e => setPriority(e.target.value)} className={selectCls}>
            <option value="">Keep ({currentPriority})</option>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="min-w-[160px]">
          <label className="block text-xs font-medium text-ink-soft mb-1">
            Category <span className="text-ink-muted font-normal">(optional)</span>
          </label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectCls}>
            <option value="">Keep current</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => assignMutation.mutate()}
            disabled={!assigneeId || assignMutation.isPending}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                       hover:bg-indigo-700 disabled:opacity-40"
          >
            {assignMutation.isPending ? 'Assigning…' : 'Assign'}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-white"
          >
            Cancel
          </button>
        </div>
        {assignMutation.isError && (
          <p className="w-full text-xs text-[#c0392b] mt-1">Assignment failed. Please try again.</p>
        )}
      </div>
    </div>
  );
}

// ── Column header ─────────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted uppercase
                   tracking-[0.06em] whitespace-nowrap">
      {children}
    </th>
  );
}

// ── Table row skeletons ───────────────────────────────────────────────────────

function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <tr className="border-b border-[#f2f2f7] animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className={`h-4 bg-[#f2f2f7] rounded ${i === 0 ? 'w-8' : i === 1 ? 'w-20' : i === 2 ? 'w-40' : 'w-16'}`} />
        </td>
      ))}
    </tr>
  );
}

// ── Bulk action bar ───────────────────────────────────────────────────────────

function BulkActionBar({
  count, agents, bulkAgentId, setBulkAgentId, isPending, onAssign,
}: {
  count:          number;
  agents:         Agent[];
  bulkAgentId:    string;
  setBulkAgentId: (id: string) => void;
  isPending:      boolean;
  onAssign:       () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-ink text-white rounded-b-xl">
      <span className="text-sm font-medium">
        {count} ticket{count !== 1 ? 's' : ''} selected
      </span>
      <div className="flex-1" />
      <select
        value={bulkAgentId}
        onChange={e => setBulkAgentId(e.target.value)}
        className="rounded-lg border border-white/20 bg-ink-soft text-white text-sm px-3 py-1.5
                   focus:outline-none"
      >
        <option value="">Select agent…</option>
        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <button
        onClick={onAssign}
        disabled={!bulkAgentId || isPending}
        className="px-4 py-1.5 rounded-lg bg-white text-ink text-sm font-semibold
                   hover:bg-[#f2f2f7] disabled:opacity-50"
      >
        {isPending ? 'Assigning…' : 'Bulk Assign'}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'triage' | 'all';

export default function AdminTicketQueuePage() {
  const queryClient = useQueryClient();
  const [tab,          setTab]          = useState<Tab>('triage');
  const [assigningId,  setAssigningId]  = useState<string | null>(null);
  const [allPage,      setAllPage]      = useState(1);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [bulkAgentId,  setBulkAgentId]  = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const { data: stats } = useQuery<Stats>({
    queryKey: ['ticket-stats'],
    queryFn:  () => api.get<Stats>('/tickets/stats').then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: triageData, isLoading: triageLoading } = useQuery<TicketsResponse>({
    queryKey: ['admin-triage'],
    queryFn:  () =>
      api.get<TicketsResponse>('/tickets', { params: { status: 'NEW', limit: 100 } }).then(r => r.data),
    enabled: tab === 'triage',
  });

  const { data: allData, isLoading: allLoading } = useQuery<TicketsResponse>({
    queryKey: ['admin-all-tickets', allPage],
    queryFn:  () =>
      api.get<TicketsResponse>('/tickets', { params: { limit: 50, page: allPage } }).then(r => r.data),
    enabled: tab === 'all',
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents-and-l2'],
    queryFn:  () => api.get<Agent[]>('/users', { params: { roles: 'AGENT,L2_L3' } }).then(r => r.data),
    staleTime: Infinity,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn:  () => api.get<Category[]>('/categories').then(r => r.data),
    staleTime: Infinity,
  });

  const allTickets    = allData?.data ?? [];
  const triageTickets = triageData?.data ?? [];

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(tickets: TicketRow[]) {
    setSelected(selected.size === tickets.length ? new Set() : new Set(tickets.map(t => t.id)));
  }

  async function handleBulkAssign(tickets: TicketRow[]) {
    if (!bulkAgentId || selected.size === 0) return;
    setBulkAssigning(true);
    await Promise.allSettled(
      tickets.filter(t => selected.has(t.id)).map(t =>
        api.post(`/tickets/${t.id}/assign`, { assigneeId: bulkAgentId }),
      ),
    );
    setBulkAssigning(false);
    setSelected(new Set());
    setBulkAgentId('');
    queryClient.invalidateQueries({ queryKey: ['admin-triage'] });
    queryClient.invalidateQueries({ queryKey: ['admin-all-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['ticket-stats'] });
  }

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">Admin Ticket Queue</h1>
        <p className="text-sm text-ink-muted mt-0.5">Triage, assign, and monitor all tickets</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total Open"   value={stats?.totalOpen} />
        <StatCard label="New / Triage" value={stats?.new}         highlight="yellow" />
        <StatCard label="Assigned"     value={stats?.assigned} />
        <StatCard label="In Progress"  value={stats?.inProgress} />
        <StatCard label="Escalated"    value={stats?.escalated}   highlight="orange" />
        <StatCard label="Breached SLA" value={stats?.breachedSla} highlight="red" />
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-0 border-b border-hair">
        {(['triage', 'all'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelected(new Set()); setAssigningId(null); }}
            className={`px-4 py-2.5 text-sm font-medium
              ${tab === t
                ? 'border-b-2 border-indigo-600 text-indigo-600 -mb-px'
                : 'text-ink-muted hover:text-ink'}`}
          >
            {t === 'triage' ? 'Triage Queue' : 'All Tickets'}
            {t === 'triage' && (stats?.new ?? 0) > 0 ? (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-[#fef9ec] text-[#b07800] text-xs font-medium">
                {stats!.new}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── TRIAGE QUEUE ── */}
      {tab === 'triage' && (
        <div className="bg-white rounded-b-xl rounded-tr-xl border border-t-0 border-hair overflow-hidden mt-0">
          {triageLoading && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-hair">
                  {['', 'Ticket ID', 'Subject', 'Category', 'Priority', 'Created', 'Actions'].map(h => (
                    <Th key={h}>{h}</Th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f2f7]">
                {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)}
              </tbody>
            </table>
          )}

          {!triageLoading && triageTickets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-ink-muted gap-3">
              <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium">Triage queue is clear</p>
            </div>
          )}

          {triageTickets.length > 0 && (
            <>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-hair">
                    <th className="pl-4 pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === triageTickets.length && triageTickets.length > 0}
                        onChange={() => toggleSelectAll(triageTickets)}
                        className="rounded border-hair text-indigo-600"
                      />
                    </th>
                    {['Ticket ID', 'Subject', 'Category', 'Priority', 'Created', 'Actions'].map(h => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f2f7]">
                  {triageTickets.map(ticket => (
                    <>
                      <tr
                        key={ticket.id}
                        className={`${assigningId === ticket.id ? 'bg-[#fafafa]' : 'hover:bg-[#fafafa]'}`}
                      >
                        <td className="pl-4 pr-2 py-3.5">
                          <input
                            type="checkbox"
                            checked={selected.has(ticket.id)}
                            onChange={() => toggleSelect(ticket.id)}
                            onClick={e => e.stopPropagation()}
                            className="rounded border-hair text-indigo-600"
                          />
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <Link to={`/tickets/${ticket.id}`}>
                            <span className="ticket-id">{ticket.id}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 max-w-xs">
                          <Link to={`/tickets/${ticket.id}`}
                            className="font-medium text-ink hover:text-indigo-600 line-clamp-1">
                            {ticket.subject}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                          {ticket.category?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge label={ticket.priority} styleMap={PRIORITY_STYLES} />
                        </td>
                        <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                          {formatDate(ticket.createdAt)}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => setAssigningId(assigningId === ticket.id ? null : ticket.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium
                              ${assigningId === ticket.id
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'border border-[#b6d8ff] text-indigo-600 hover:bg-[#e0f0fe]'}`}
                          >
                            {assigningId === ticket.id ? 'Cancel' : 'Assign'}
                          </button>
                        </td>
                      </tr>

                      {assigningId === ticket.id && (
                        <tr key={`panel-${ticket.id}`}>
                          <td colSpan={7} className="p-0">
                            <AssignPanel
                              ticketId={ticket.id}
                              currentPriority={ticket.priority}
                              agents={agents}
                              categories={categories}
                              onSuccess={() => setAssigningId(null)}
                              onCancel={() => setAssigningId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>

              {selected.size > 0 && (
                <BulkActionBar
                  count={selected.size}
                  agents={agents}
                  bulkAgentId={bulkAgentId}
                  setBulkAgentId={setBulkAgentId}
                  isPending={bulkAssigning}
                  onAssign={() => handleBulkAssign(triageTickets)}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ── ALL TICKETS ── */}
      {tab === 'all' && (
        <div className="bg-white rounded-b-xl rounded-tr-xl border border-t-0 border-hair overflow-hidden">
          {allLoading && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-hair">
                  {['', 'Ticket ID', 'Subject', 'Category', 'Priority', 'Status', 'Assignee', 'SLA', 'Created'].map(h => <Th key={h}>{h}</Th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f2f7]">
                {Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} cols={9} />)}
              </tbody>
            </table>
          )}

          {!allLoading && allTickets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-ink-muted gap-3">
              <p className="text-sm font-medium">No tickets found</p>
            </div>
          )}

          {!allLoading && allTickets.length > 0 && (
            <>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-hair">
                    <th className="pl-4 pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === allTickets.length && allTickets.length > 0}
                        onChange={() => toggleSelectAll(allTickets)}
                        className="rounded border-hair text-indigo-600"
                      />
                    </th>
                    {['Ticket ID', 'Subject', 'Category', 'Priority', 'Status', 'Assignee', 'SLA', 'Created'].map(h => <Th key={h}>{h}</Th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f2f7]">
                  {allTickets.map(ticket => (
                    <tr key={ticket.id} className="hover:bg-[#fafafa]">
                      <td className="pl-4 pr-2 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(ticket.id)}
                          onChange={() => toggleSelect(ticket.id)}
                          className="rounded border-hair text-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Link to={`/tickets/${ticket.id}`}>
                          <span className="ticket-id">{ticket.id}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 max-w-xs">
                        <Link to={`/tickets/${ticket.id}`}
                          className="font-medium text-ink hover:text-indigo-600 line-clamp-1">
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
                        {ticket.assignee?.name ?? <span className="italic">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3.5 w-32">
                        <div className="flex flex-col gap-0.5">
                          <SlaBar ticket={ticket} />
                          <span className="text-xs text-ink-muted">
                            {formatSlaRemaining(ticket.slaResolutionDue)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                        {formatDate(ticket.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(allData?.totalPages ?? 1) > 1 && (
                <div className="px-4 pb-4 pt-3 border-t border-[#f2f2f7]">
                  <Pagination
                    page={allPage}
                    totalPages={allData?.totalPages ?? 1}
                    total={allData?.total ?? 0}
                    onPageChange={setAllPage}
                  />
                </div>
              )}

              {selected.size > 0 && (
                <BulkActionBar
                  count={selected.size}
                  agents={agents}
                  bulkAgentId={bulkAgentId}
                  setBulkAgentId={setBulkAgentId}
                  isPending={bulkAssigning}
                  onAssign={() => handleBulkAssign(allTickets)}
                />
              )}
            </>
          )}
        </div>
      )}
    </Layout>
  );
}
