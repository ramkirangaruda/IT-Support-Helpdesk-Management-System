import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { computeSlaPercent, formatSlaRemaining, slaColor, type SlaFields } from '../../lib/sla';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  email: string;
}

interface Category {
  id: string;
  name: string;
}

interface TicketRow extends SlaFields {
  id: string;
  subject: string;
  priority: string;
  status: string;
  category: { id: string; name: string } | null;
  assignee: { id: string; name: string; email: string } | null;
  requester: { id: string; name: string; email: string };
  createdAt: string;
}

interface TicketsResponse {
  data: TicketRow[];
  total: number;
  page: number;
  limit: number;
}

interface Stats {
  totalOpen: number;
  new: number;
  assigned: number;
  inProgress: number;
  escalated: number;
  breachedSla: number;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700 border border-blue-200',
  ASSIGNED: 'bg-blue-50 text-blue-600 border border-blue-200',
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
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ── SLA bar ───────────────────────────────────────────────────────────────────

function SlaBar({ ticket }: { ticket: SlaFields }) {
  const pct = computeSlaPercent(ticket);
  const color = slaColor(pct);
  const barCls = color === 'green' ? 'bg-green-500'
    : color === 'yellow' ? 'bg-yellow-400'
    : color === 'red'    ? 'bg-red-500'
    : 'bg-gray-200';

  if (pct === null) return <span className="text-xs text-gray-400">—</span>;

  return (
    <div className="flex items-center gap-1.5 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      <span className={`text-xs font-medium w-10 text-right
        ${color === 'green' ? 'text-green-700' : color === 'yellow' ? 'text-yellow-700' : 'text-red-600'}`}>
        {pct <= 0 ? 'Over' : `${Math.round(pct)}%`}
      </span>
    </div>
  );
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, highlight,
}: { label: string; value: number | undefined; highlight?: 'red' | 'purple' | 'yellow' }) {
  const base = 'bg-white rounded-xl border p-4 flex flex-col gap-1';
  const border = highlight === 'red' ? 'border-red-200'
    : highlight === 'purple' ? 'border-purple-200'
    : highlight === 'yellow' ? 'border-yellow-200'
    : 'border-gray-200';
  const numCls = highlight === 'red' ? 'text-red-600'
    : highlight === 'purple' ? 'text-purple-700'
    : highlight === 'yellow' ? 'text-yellow-700'
    : 'text-gray-900';

  return (
    <div className={`${base} ${border}`}>
      <span className={`text-2xl font-bold tabular-nums ${numCls}`}>
        {value ?? '—'}
      </span>
      <span className="text-xs text-gray-500 font-medium">{label}</span>
    </div>
  );
}

// ── Inline assign panel ───────────────────────────────────────────────────────

function AssignPanel({
  ticketId,
  currentPriority,
  agents,
  categories,
  onSuccess,
  onCancel,
}: {
  ticketId: string;
  currentPriority: string;
  agents: Agent[];
  categories: Category[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const queryClient = useQueryClient();

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
    <div className="p-4 bg-indigo-50 border-t border-indigo-100">
      <div className="max-w-2xl flex flex-wrap gap-3 items-end">
        {/* Agent */}
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Assign to <span className="text-red-500">*</span>
          </label>
          <select
            value={assigneeId}
            onChange={e => setAssigneeId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">Select agent…</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
            ))}
          </select>
        </div>

        {/* Priority override */}
        <div className="min-w-[130px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Priority <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            value={priority}
            onChange={e => setPriority(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">Keep ({currentPriority})</option>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Category override */}
        <div className="min-w-[160px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Category <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">Keep current</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => assignMutation.mutate()}
            disabled={!assigneeId || assignMutation.isPending}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                       hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            {assignMutation.isPending ? 'Assigning…' : 'Assign'}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600
                       hover:bg-white transition-colors"
          >
            Cancel
          </button>
        </div>

        {assignMutation.isError && (
          <p className="w-full text-xs text-red-600 mt-1">Assignment failed. Please try again.</p>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'triage' | 'all';

export default function AdminTicketQueuePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('triage');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [allPage, setAllPage] = useState(1);

  // Bulk select state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAgentId, setBulkAgentId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: stats } = useQuery<Stats>({
    queryKey: ['ticket-stats'],
    queryFn: () => api.get<Stats>('/tickets/stats').then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: triageData, isLoading: triageLoading } = useQuery<TicketsResponse>({
    queryKey: ['admin-triage'],
    queryFn: () =>
      api.get<TicketsResponse>('/tickets', { params: { status: 'NEW', limit: 100 } })
        .then(r => r.data),
    enabled: tab === 'triage',
  });

  const { data: allData, isLoading: allLoading } = useQuery<TicketsResponse>({
    queryKey: ['admin-all-tickets', allPage],
    queryFn: () =>
      api.get<TicketsResponse>('/tickets', { params: { limit: 50, page: allPage } })
        .then(r => r.data),
    enabled: tab === 'all',
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents-and-l2'],
    queryFn: () => api.get<Agent[]>('/users', { params: { roles: 'AGENT,L2_L3' } }).then(r => r.data),
    staleTime: Infinity,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories').then(r => r.data),
    staleTime: Infinity,
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const allTickets = allData?.data ?? [];
  const triageTickets = triageData?.data ?? [];
  const limit = 50;

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(tickets: TicketRow[]) {
    if (selected.size === tickets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tickets.map(t => t.id)));
    }
  }

  async function handleBulkAssign(tickets: TicketRow[]) {
    if (!bulkAgentId || selected.size === 0) return;
    setBulkAssigning(true);
    await Promise.allSettled(
      tickets
        .filter(t => selected.has(t.id))
        .map(t => api.post(`/tickets/${t.id}/assign`, { assigneeId: bulkAgentId })),
    );
    setBulkAssigning(false);
    setSelected(new Set());
    setBulkAgentId('');
    queryClient.invalidateQueries({ queryKey: ['admin-triage'] });
    queryClient.invalidateQueries({ queryKey: ['admin-all-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['ticket-stats'] });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Ticket Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Triage, assign, and monitor all tickets
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total Open" value={stats?.totalOpen} />
        <StatCard label="New / Triage" value={stats?.new} highlight="yellow" />
        <StatCard label="Assigned" value={stats?.assigned} />
        <StatCard label="In Progress" value={stats?.inProgress} />
        <StatCard label="Escalated" value={stats?.escalated} highlight="purple" />
        <StatCard label="Breached SLA" value={stats?.breachedSla} highlight="red" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['triage', 'all'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelected(new Set()); setAssigningId(null); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors
              ${tab === t
                ? 'bg-white border-gray-200 text-indigo-600 -mb-px'
                : 'text-gray-500 border-transparent hover:text-gray-700'}`}
          >
            {t === 'triage' ? 'Triage Queue' : 'All Tickets'}
            {t === 'triage' && stats?.new ? (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">
                {stats.new}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── TRIAGE QUEUE TAB ─────────────────────────────────────────────── */}
      {tab === 'triage' && (
        <TriageTable
          tickets={triageTickets}
          isLoading={triageLoading}
          assigningId={assigningId}
          setAssigningId={setAssigningId}
          selected={selected}
          toggleSelect={toggleSelect}
          toggleSelectAll={() => toggleSelectAll(triageTickets)}
          agents={agents}
          categories={categories}
          bulkAgentId={bulkAgentId}
          setBulkAgentId={setBulkAgentId}
          bulkAssigning={bulkAssigning}
          onBulkAssign={() => handleBulkAssign(triageTickets)}
        />
      )}

      {/* ── ALL TICKETS TAB ──────────────────────────────────────────────── */}
      {tab === 'all' && (
        <AllTicketsTable
          tickets={allTickets}
          isLoading={allLoading}
          total={allData?.total ?? 0}
          page={allPage}
          limit={limit}
          setPage={setAllPage}
          selected={selected}
          toggleSelect={toggleSelect}
          toggleSelectAll={() => toggleSelectAll(allTickets)}
          agents={agents}
          bulkAgentId={bulkAgentId}
          setBulkAgentId={setBulkAgentId}
          bulkAssigning={bulkAssigning}
          onBulkAssign={() => handleBulkAssign(allTickets)}
        />
      )}
    </Layout>
  );
}

// ── Triage Queue Table ────────────────────────────────────────────────────────

function TriageTable({
  tickets, isLoading, assigningId, setAssigningId, selected, toggleSelect, toggleSelectAll,
  agents, categories, bulkAgentId, setBulkAgentId, bulkAssigning, onBulkAssign,
}: {
  tickets: TicketRow[];
  isLoading: boolean;
  assigningId: string | null;
  setAssigningId: (id: string | null) => void;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  agents: Agent[];
  categories: Category[];
  bulkAgentId: string;
  setBulkAgentId: (id: string) => void;
  bulkAssigning: boolean;
  onBulkAssign: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
      )}

      {!isLoading && tickets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <svg className="w-10 h-10 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">Triage queue is clear</p>
        </div>
      )}

      {tickets.length > 0 && (
        <>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="pl-4 pr-2 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === tickets.length && tickets.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                {['Ticket ID', 'Subject', 'Category', 'Priority', 'Created', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tickets.map(ticket => (
                <>
                  <tr
                    key={ticket.id}
                    className={`transition-colors ${assigningId === ticket.id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="pl-4 pr-2 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(ticket.id)}
                        onChange={() => toggleSelect(ticket.id)}
                        onClick={e => e.stopPropagation()}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
                      <Link to={`/tickets/${ticket.id}`} className="hover:underline">{ticket.id}</Link>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <Link to={`/tickets/${ticket.id}`}
                        className="font-medium text-gray-900 hover:text-indigo-600 line-clamp-1">
                        {ticket.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {ticket.category?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={ticket.priority} styleMap={PRIORITY_STYLES} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(ticket.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setAssigningId(assigningId === ticket.id ? null : ticket.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                          ${assigningId === ticket.id
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : 'border border-indigo-300 text-indigo-700 hover:bg-indigo-50'}`}
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

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <BulkActionBar
              count={selected.size}
              agents={agents}
              bulkAgentId={bulkAgentId}
              setBulkAgentId={setBulkAgentId}
              isPending={bulkAssigning}
              onAssign={onBulkAssign}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── All Tickets Table ─────────────────────────────────────────────────────────

function AllTicketsTable({
  tickets, isLoading, total, page, limit, setPage,
  selected, toggleSelect, toggleSelectAll,
  agents, bulkAgentId, setBulkAgentId, bulkAssigning, onBulkAssign,
}: {
  tickets: TicketRow[];
  isLoading: boolean;
  total: number;
  page: number;
  limit: number;
  setPage: (p: number) => void;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  agents: Agent[];
  bulkAgentId: string;
  setBulkAgentId: (id: string) => void;
  bulkAssigning: boolean;
  onBulkAssign: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
      )}

      {!isLoading && tickets.length > 0 && (
        <>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="pl-4 pr-2 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === tickets.length && tickets.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                {['Ticket ID', 'Subject', 'Category', 'Priority', 'Status', 'Assignee', 'SLA', 'Created'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tickets.map(ticket => (
                <tr key={ticket.id} className="hover:bg-gray-50 transition-colors">
                  <td className="pl-4 pr-2 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(ticket.id)}
                      onChange={() => toggleSelect(ticket.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
                    <Link to={`/tickets/${ticket.id}`} className="hover:underline">{ticket.id}</Link>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <Link to={`/tickets/${ticket.id}`}
                      className="font-medium text-gray-900 hover:text-indigo-600 line-clamp-1">
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {ticket.category?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={ticket.priority} styleMap={PRIORITY_STYLES} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={ticket.status} styleMap={STATUS_STYLES} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                    {ticket.assignee?.name ?? <span className="text-gray-400 italic">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 w-32">
                    <div className="flex flex-col gap-0.5">
                      <SlaBar ticket={ticket} />
                      <span className="text-xs text-gray-400">
                        {formatSlaRemaining(ticket.slaResolutionDue)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {formatDate(ticket.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-500">
                {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1 text-xs rounded border border-gray-200
                             disabled:opacity-40 hover:bg-white transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={page * limit >= total}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1 text-xs rounded border border-gray-200
                             disabled:opacity-40 hover:bg-white transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <BulkActionBar
              count={selected.size}
              agents={agents}
              bulkAgentId={bulkAgentId}
              setBulkAgentId={setBulkAgentId}
              isPending={bulkAssigning}
              onAssign={onBulkAssign}
            />
          )}
        </>
      )}

      {!isLoading && tickets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-sm font-medium">No tickets found</p>
        </div>
      )}
    </div>
  );
}

// ── Bulk Action Bar ───────────────────────────────────────────────────────────

function BulkActionBar({
  count, agents, bulkAgentId, setBulkAgentId, isPending, onAssign,
}: {
  count: number;
  agents: Agent[];
  bulkAgentId: string;
  setBulkAgentId: (id: string) => void;
  isPending: boolean;
  onAssign: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-indigo-600 text-white rounded-b-xl">
      <span className="text-sm font-medium">
        {count} ticket{count !== 1 ? 's' : ''} selected
      </span>
      <div className="flex-1" />
      <select
        value={bulkAgentId}
        onChange={e => setBulkAgentId(e.target.value)}
        className="rounded-lg border border-indigo-400 bg-indigo-700 text-white text-sm px-3 py-1.5
                   focus:outline-none focus:ring-2 focus:ring-white/50 placeholder-indigo-300"
      >
        <option value="">Select agent…</option>
        {agents.map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <button
        onClick={onAssign}
        disabled={!bulkAgentId || isPending}
        className="px-4 py-1.5 rounded-lg bg-white text-indigo-700 text-sm font-semibold
                   hover:bg-indigo-50 transition-colors disabled:opacity-50"
      >
        {isPending ? 'Assigning…' : 'Bulk Assign'}
      </button>
    </div>
  );
}
