import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import api from '../../api/api';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  openByStatus:       Record<string, number>;
  openByPriority:     Record<string, number>;
  slaBreached:        number;
  slaAtRisk:          number;
  avgResolutionHours: number;
  escalationRate:     number;
  reopenRate:         number;
  topCategories:      { name: string; count: number }[];
  agentWorkload:      { agentName: string; open: number; resolved_today: number }[];
}

interface TicketRow {
  id:         string;
  subject:    string;
  priority:   string;
  status:     string;
  createdAt:  string;
  resolvedAt: string | null;
  category:   { id: string; name: string } | null;
  assignee:   { id: string; name: string; email: string } | null;
  requester:  { id: string; name: string; email: string };
}

interface TicketsResponse {
  data:  TicketRow[];
  total: number;
  page:  number;
  limit: number;
}

interface Category { id: string; name: string }
interface Agent    { id: string; name: string; email: string }

// ── Design tokens ─────────────────────────────────────────────────────────────

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

const PRIORITY_STYLES: Record<string, string> = {
  LOW:      'bg-[#f2f2f7] text-[#6e6e73]',
  MEDIUM:   'bg-[#e0f0fe] text-[#0071e3]',
  HIGH:     'bg-[#fff2ea] text-[#b45309]',
  CRITICAL: 'bg-[#fff1f2] text-[#c0392b]',
};

const PRIORITY_BARS = [
  { key: 'CRITICAL', fill: '#c0392b' },
  { key: 'HIGH',     fill: '#d4660c' },
  { key: 'MEDIUM',   fill: '#0071e3' },
  { key: 'LOW',      fill: '#8e8e93' },
];

const PIE_COLORS = ['#0071e3', '#4a9eff', '#83bdff', '#b6d8ff', '#8e8e93'];

// ── Shared primitives ─────────────────────────────────────────────────────────

function Badge({ label, styleMap }: { label: string; styleMap: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${styleMap[label] ?? 'bg-[#f2f2f7] text-[#6e6e73]'}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function StatCard({ label, value, sub, highlight }: {
  label:      string;
  value:      string | number;
  sub?:       string;
  highlight?: 'red' | 'orange' | 'yellow' | 'indigo';
}) {
  const borderCls = highlight === 'red'
    ? 'border-l-2 border-l-[#c0392b] border-t border-r border-b border-hair'
    : highlight === 'orange'
    ? 'border-l-2 border-l-[#d4660c] border-t border-r border-b border-hair'
    : highlight === 'yellow'
    ? 'border-l-2 border-l-[#b07800] border-t border-r border-b border-hair'
    : highlight === 'indigo'
    ? 'border-l-2 border-l-indigo-600 border-t border-r border-b border-hair'
    : 'border border-hair';
  const numCls = highlight === 'red' ? 'text-[#c0392b]'
    : highlight === 'orange' ? 'text-[#d4660c]'
    : highlight === 'yellow' ? 'text-[#b07800]'
    : highlight === 'indigo' ? 'text-indigo-600'
    : 'text-ink';
  return (
    <div className={`bg-white rounded-xl ${borderCls} p-5 flex flex-col gap-1`}>
      <span className={`text-[22px] font-semibold tabular-nums leading-none ${numCls}`}>{value}</span>
      {sub && <span className="text-[11px] text-ink-muted mt-0.5">{sub}</span>}
      <span className="text-xs font-medium text-ink-muted mt-1">{label}</span>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-hair p-5 animate-pulse">
      <div className="h-7 w-12 bg-[#f2f2f7] rounded mb-2" />
      <div className="h-3 w-20 bg-[#f2f2f7] rounded" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-hair p-5 animate-pulse">
      <div className="h-4 w-40 bg-[#f2f2f7] rounded mb-4" />
      <div className="h-[200px] bg-[#f2f2f7] rounded-lg" />
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <div className="flex gap-4 px-4 py-3.5 border-b border-[#f2f2f7] last:border-0 animate-pulse">
      {[20, 48, 16, 16, 20, 20, 16].map((w, i) => (
        <div key={i} className={`h-4 bg-[#f2f2f7] rounded`} style={{ width: `${w * 4}px` }} />
      ))}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatHours(h: number) {
  if (h === 0) return '—';
  if (h < 24) return `${h}h`;
  return `${(h / 24).toFixed(1)}d`;
}

const selectCls = 'rounded-lg border border-hair px-3 py-2 text-sm bg-white text-ink focus:outline-none focus:border-2 focus:border-indigo-600';
const inputCls  = 'rounded-lg border border-hair px-3 py-2 text-sm bg-white text-ink focus:outline-none focus:border-2 focus:border-indigo-600';

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['reports-dashboard'],
    queryFn:  () => api.get<DashboardData>('/reports/dashboard').then(r => r.data),
    refetchInterval: 60_000,
  });

  const totalOpen = data
    ? Object.values(data.openByStatus).reduce((a, b) => a + b, 0)
    : 0;

  const priorityChartData = PRIORITY_BARS.map(b => ({
    name: b.key,
    count: data?.openByPriority[b.key] ?? 0,
    fill: b.fill,
  }));

  const pieData = (data?.topCategories ?? []).map(c => ({ name: c.name, value: c.count }));

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Open Tickets"       value={totalOpen} highlight="indigo" />
            <StatCard label="SLA Breached"        value={data?.slaBreached ?? 0}        highlight="red" />
            <StatCard label="SLA At Risk"         value={data?.slaAtRisk ?? 0}          highlight="yellow" />
            <StatCard label="Avg Resolution"      value={formatHours(data?.avgResolutionHours ?? 0)} />
            <StatCard label="Escalation Rate"     value={`${data?.escalationRate ?? 0}%`} highlight={((data?.escalationRate ?? 0) > 10) ? 'orange' : undefined} />
            <StatCard label="Reopen Rate"         value={`${data?.reopenRate ?? 0}%`}   highlight={((data?.reopenRate ?? 0) > 5) ? 'yellow' : undefined} />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-hair p-5">
              <h3 className="text-[13px] font-semibold text-ink mb-4">Open Tickets by Priority</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={priorityChartData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f2f2f7" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#86868b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#86868b' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ border: '1px solid #d2d2d7', borderRadius: 8, fontSize: 12, boxShadow: 'none' }}
                    cursor={{ fill: '#f5f5f7' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {priorityChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-hair p-5">
              <h3 className="text-[13px] font-semibold text-ink mb-4">Top Categories (Open)</h3>
              {pieData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-ink-muted text-sm">
                  No data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} paddingAngle={2}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ border: '1px solid #d2d2d7', borderRadius: 8, fontSize: 12, boxShadow: 'none' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#6e6e73' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </div>

      {/* Agent workload */}
      <div className="bg-white rounded-xl border border-hair overflow-hidden">
        <div className="px-5 py-4 border-b border-hair">
          <h3 className="text-[13px] font-semibold text-ink">Agent Workload</h3>
        </div>
        {isLoading ? (
          <div className="animate-pulse p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-4 w-32 bg-[#f2f2f7] rounded" />
                <div className="h-4 w-16 bg-[#f2f2f7] rounded" />
                <div className="h-4 w-16 bg-[#f2f2f7] rounded" />
              </div>
            ))}
          </div>
        ) : (data?.agentWorkload ?? []).length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-muted text-center">No agents found</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-hair">
                {['Agent', 'Open Tickets', 'Resolved Today'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f2f7]">
              {data!.agentWorkload.map(a => (
                <tr key={a.agentName} className="hover:bg-[#fafafa]">
                  <td className="px-5 py-3 font-medium text-ink">{a.agentName}</td>
                  <td className="px-5 py-3 tabular-nums text-ink-soft">{a.open}</td>
                  <td className="px-5 py-3 tabular-nums text-[#1a7f4b] font-medium">{a.resolved_today}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Tab: Ticket Report ────────────────────────────────────────────────────────

function TicketReportTab() {
  const [from,      setFrom]      = useState('');
  const [to,        setTo]        = useState('');
  const [category,  setCategory]  = useState('');
  const [priority,  setPriority]  = useState('');
  const [agentId,   setAgentId]   = useState('');
  const [openOnly,  setOpenOnly]  = useState(false);
  const [page,      setPage]      = useState(1);

  // Applied filters (only change on "Apply")
  const [applied, setApplied] = useState({ from: '', to: '', category: '', priority: '', agentId: '', openOnly: false });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn:  () => api.get<Category[]>('/categories').then(r => r.data),
    staleTime: Infinity,
  });

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents-list'],
    queryFn:  () => api.get<Agent[]>('/users', { params: { role: 'AGENT' } }).then(r => r.data),
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery<TicketsResponse>({
    queryKey: ['reports-tickets', applied, page],
    queryFn:  () => api.get<TicketsResponse>('/reports/tickets', {
      params: {
        from:      applied.from      || undefined,
        to:        applied.to        || undefined,
        category:  applied.category  || undefined,
        priority:  applied.priority  || undefined,
        agentId:   applied.agentId   || undefined,
        open:      applied.openOnly  || undefined,
        page,
        limit: 25,
      },
    }).then(r => r.data),
  });

  const tickets    = data?.data ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  function applyFilters() {
    setApplied({ from, to, category, priority, agentId, openOnly });
    setPage(1);
  }

  function clearFilters() {
    setFrom(''); setTo(''); setCategory(''); setPriority(''); setAgentId(''); setOpenOnly(false);
    setApplied({ from: '', to: '', category: '', priority: '', agentId: '', openOnly: false });
    setPage(1);
  }

  const hasFilters = from || to || category || priority || agentId || openOnly;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-hair p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em]">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em]">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em]">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={selectCls}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em]">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={selectCls}>
              <option value="">All priorities</option>
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em]">Agent</label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} className={selectCls}>
              <option value="">All agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={e => setOpenOnly(e.target.checked)}
              className="rounded border-hair text-indigo-600"
            />
            Open only
          </label>
          <div className="flex gap-2 pb-0.5">
            <button onClick={applyFilters}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
              Apply
            </button>
            {hasFilters && (
              <button onClick={clearFilters}
                className="px-3 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]">
                Clear
              </button>
            )}
          </div>
        </div>
        {total > 0 && !isLoading && (
          <p className="text-xs text-ink-muted mt-3">{total} ticket{total !== 1 ? 's' : ''} found</p>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-hair overflow-hidden">
        {isLoading ? (
          <div>
            <div className="border-b border-hair h-10" />
            {Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-medium text-ink-muted">No tickets match the current filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-hair">
                  {['Ticket ID', 'Subject', 'Category', 'Priority', 'Status', 'Requester', 'Assignee', 'Created', 'Resolved'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f2f7]">
                {tickets.map(t => (
                  <tr key={t.id} className="hover:bg-[#fafafa]">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="ticket-id">{t.id}</span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="line-clamp-1 text-ink font-medium">{t.subject}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted text-xs whitespace-nowrap">
                      {t.category?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge label={t.priority} styleMap={PRIORITY_STYLES} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge label={t.status} styleMap={STATUS_STYLES} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-soft whitespace-nowrap">{t.requester.name}</td>
                    <td className="px-4 py-3 text-xs text-ink-soft whitespace-nowrap">{t.assignee?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">
                      {t.resolvedAt ? formatDate(t.resolvedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && total > 25 && (
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      )}
    </div>
  );
}

// ── Tab: Export ───────────────────────────────────────────────────────────────

function ExportTab() {
  const [from,      setFrom]      = useState('');
  const [to,        setTo]        = useState('');
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  async function handleExport() {
    setExporting(true);
    setError('');
    setSuccess(false);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to)   params.set('to',   to);
      const res = await api.get<Blob>(`/reports/export?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement('a');
      a.href    = url;
      a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess(true);
    } catch {
      setError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <div className="bg-white rounded-xl border border-hair p-6 space-y-5">
        <div>
          <h3 className="text-[13px] font-semibold text-ink mb-1">Export Tickets to CSV</h3>
          <p className="text-xs text-ink-muted">
            Downloads all tickets (or a date-filtered subset) as a CSV file with ID, subject,
            category, priority, status, requester, assignee, created, resolved, and resolution hours.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              From date <span className="normal-case text-ink-muted font-normal">(optional)</span>
            </label>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setSuccess(false); }}
              className={`w-full ${inputCls}`} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              To date <span className="normal-case text-ink-muted font-normal">(optional)</span>
            </label>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setSuccess(false); }}
              className={`w-full ${inputCls}`} />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-4 py-3">
            <p className="text-sm text-[#c0392b]">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-[#eafaf3] border border-[#a3d9b8] px-4 py-3">
            <p className="text-sm text-[#1a7f4b]">CSV downloaded successfully.</p>
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white
                     text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? 'Exporting…' : 'Download CSV'}
        </button>

        <p className="text-xs text-ink-muted">
          Leave both dates blank to export all tickets ever created.
        </p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'tickets' | 'export';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview'       },
  { key: 'tickets',  label: 'Ticket Report'  },
  { key: 'export',   label: 'Export'         },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-ink">Reports</h1>
        <p className="text-sm text-ink-muted mt-0.5">Analytics, ticket data, and exports</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b border-hair">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative
              ${tab === t.key
                ? 'border-b-2 border-indigo-600 text-indigo-600 -mb-px'
                : 'text-ink-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'tickets'  && <TicketReportTab />}
      {tab === 'export'   && <ExportTab />}
    </Layout>
  );
}
