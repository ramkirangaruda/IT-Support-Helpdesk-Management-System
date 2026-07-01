import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { computeSlaPercent, formatSlaRemaining, slaColor, type SlaFields } from '../../lib/sla';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverdueEmployee {
  id:                string;
  name:              string;
  email:             string;
  holdCount:         number;
  lastReminderAt:    string | null;
  lastReminderCycle: number | null;
}

interface OverdueData {
  maxDevices: number;
  employees:  OverdueEmployee[];
}

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

interface TicketRow extends SlaFields {
  id:         string;
  subject:    string;
  priority:   string;
  status:     string;
  category:   { id: string; name: string } | null;
  assignee:   { id: string; name: string; email: string } | null;
  requester:  { id: string; name: string; email: string };
  createdAt:  string;
  resolvedAt: string | null;
}

interface TicketsResponse {
  data:  TicketRow[];
  total: number;
  page:  number;
  limit: number;
}

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

const OPEN_STATUSES = new Set(['NEW', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'ESCALATED', 'REOPENED']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ label, styleMap }: { label: string; styleMap: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${styleMap[label] ?? 'bg-[#f2f2f7] text-[#6e6e73]'}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function TicketId({ id }: { id: string }) {
  return <span className="ticket-id">{id}</span>;
}

function formatHours(h: number): string {
  if (h === 0) return '—';
  if (h < 24) return `${h}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Skeleton components ───────────────────────────────────────────────────────

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
      <div className="h-[220px] bg-[#f2f2f7] rounded-lg" />
    </div>
  );
}

function TableRowSkeleton({ cols = 8 }: { cols?: number }) {
  return (
    <div className="flex gap-4 px-4 py-3.5 border-b border-[#f2f2f7] last:border-0 animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className={`h-4 bg-[#f2f2f7] rounded ${
            i === 0 ? 'w-20' : i === 1 ? 'w-44' : i === 2 ? 'w-20' : 'w-14'
          }`}
        />
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, highlight,
}: {
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

  const numCls = highlight === 'red'    ? 'text-[#c0392b]'
    : highlight === 'orange'  ? 'text-[#d4660c]'
    : highlight === 'yellow'  ? 'text-[#b07800]'
    : highlight === 'indigo'  ? 'text-indigo-600'
    : 'text-ink';

  return (
    <div className={`bg-white rounded-xl ${borderCls} p-5 flex flex-col gap-1`}>
      <span className={`text-[22px] font-semibold tabular-nums leading-none ${numCls}`}>{value}</span>
      {sub && <span className="text-[11px] text-ink-muted mt-0.5">{sub}</span>}
      <span className="text-xs font-medium text-ink-muted mt-1">{label}</span>
    </div>
  );
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

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-hair p-5">
      <h2 className="text-[13px] font-semibold text-ink mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ── Column header helper ──────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';

function Th({ children, onClick, sortDir }: {
  children: React.ReactNode;
  onClick?: () => void;
  sortDir?: SortDir;
}) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-3 text-left text-[11px] font-medium text-ink-muted uppercase
                  tracking-[0.06em] whitespace-nowrap
                  ${onClick ? 'cursor-pointer select-none hover:text-indigo-600' : ''}`}
    >
      {children}
      {sortDir && <span className="ml-1 text-ink-muted">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

// ── Main admin dashboard ──────────────────────────────────────────────────────

function AdminDashboard() {
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo,   setExportTo]   = useState('');
  const [sortDir,    setSortDir]    = useState<SortDir>('asc');
  const [exporting,  setExporting]  = useState(false);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['reports-dashboard'],
    queryFn:  () => api.get<DashboardData>('/reports/dashboard').then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: openTicketsRes, isLoading: tableLoading } = useQuery<TicketsResponse>({
    queryKey: ['reports-open-tickets'],
    queryFn:  () =>
      api.get<TicketsResponse>('/reports/tickets', { params: { open: 'true', limit: 200 } })
        .then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: overdueData } = useQuery<OverdueData>({
    queryKey: ['devices-overdue'],
    queryFn:  () => api.get<OverdueData>('/devices/overdue').then(r => r.data),
    refetchInterval: 300_000,
  });

  const { data: procurementPrs = [] } = useQuery<{ id: string; status: string; estCost: string }[]>({
    queryKey: ['dashboard-prs'],
    queryFn:  () =>
      api.get<{ data: { id: string; status: string; estCost: string }[] }>('/purchase-requests', { params: { limit: 100 } })
        .then(r => r.data.data),
    refetchInterval: 60_000,
  });

  const { data: pendingDeviceReqs = [] } = useQuery<{ id: string }[]>({
    queryKey: ['dashboard-pending-devices'],
    queryFn:  () =>
      api.get<{ data: { id: string }[] }>('/device-requests', { params: { status: 'PENDING_MANAGER_APPROVAL', limit: 100 } })
        .then(r => r.data.data),
    refetchInterval: 60_000,
  });

  // ── Chart data ────────────────────────────────────────────────────────────

  const priorityData = PRIORITY_BARS.map(b => ({
    name:  b.key,
    count: data?.openByPriority[b.key] ?? 0,
    fill:  b.fill,
  }));

  const agentData = (data?.agentWorkload ?? []).map(a => ({
    name:             a.agentName.split(' ')[0],
    fullName:         a.agentName,
    Open:             a.open,
    'Resolved Today': a.resolved_today,
  }));

  const catData = (data?.topCategories ?? []).map(c => ({
    name:  c.name,
    value: c.count,
  }));

  const totalOpen = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.openByStatus).reduce((s, n) => s + n, 0);
  }, [data]);

  const pendingApprovals = useMemo(() => {
    const pendingPrs = procurementPrs.filter(pr =>
      pr.status === 'PENDING_MANAGER_APPROVAL' || pr.status === 'PENDING_FINANCE_APPROVAL',
    ).length;
    return pendingDeviceReqs.length + pendingPrs;
  }, [procurementPrs, pendingDeviceReqs]);

  const pipelineValue = useMemo(() => {
    const TERMINAL = new Set(['RECEIVED', 'REJECTED']);
    return procurementPrs
      .filter(pr => !TERMINAL.has(pr.status))
      .reduce((sum, pr) => sum + parseFloat(pr.estCost || '0'), 0);
  }, [procurementPrs]);

  const openTickets = useMemo(() => {
    const rows = (openTicketsRes?.data ?? []).filter(t => OPEN_STATUSES.has(t.status));
    return [...rows].sort((a, b) => {
      const aD = a.slaResolutionDue ? new Date(a.slaResolutionDue).getTime() : Infinity;
      const bD = b.slaResolutionDue ? new Date(b.slaResolutionDue).getTime() : Infinity;
      return sortDir === 'asc' ? aD - bD : bD - aD;
    });
  }, [openTicketsRes, sortDir]);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (exportFrom) params.set('from', exportFrom);
      if (exportTo)   params.set('to',   exportTo);
      const res = await api.get<Blob>(`/reports/export?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Layout>
      {/* Page header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-ink-muted mt-0.5">Live metrics · refreshes every 60 s</p>
        </div>

        {/* CSV export */}
        <div className="flex items-end gap-2 bg-white border border-hair rounded-xl p-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-muted mb-1 uppercase tracking-wider">From</label>
            <input
              type="date"
              value={exportFrom}
              onChange={e => setExportFrom(e.target.value)}
              className="rounded-lg border border-hair px-2.5 py-1.5 text-sm text-ink
                         focus:outline-none focus:border-2 focus:border-indigo-600"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-muted mb-1 uppercase tracking-wider">To</label>
            <input
              type="date"
              value={exportTo}
              onChange={e => setExportTo(e.target.value)}
              className="rounded-lg border border-hair px-2.5 py-1.5 text-sm text-ink
                         focus:outline-none focus:border-2 focus:border-indigo-600"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium
                       hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
          >
            {exporting ? 'Exporting…' : '↓ Export CSV'}
          </button>
        </div>
      </div>

      {/* Procurement summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard
          label="Pending Approvals"
          value={pendingApprovals}
          sub="device + purchase requests"
          highlight={pendingApprovals > 0 ? 'yellow' : undefined}
        />
        <StatCard
          label="Pipeline Value"
          value={`₹${pipelineValue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          sub="active purchase requests"
          highlight="indigo"
        />
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <ChartSkeleton key={i} />)}
          </div>
        </div>
      )}

      {!isLoading && data && (
        <div className="space-y-6">
          {/* Top stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Open Tickets"    value={totalOpen} />
            <StatCard label="SLA Breached"    value={data.slaBreached}
              highlight={data.slaBreached > 0 ? 'red' : undefined} />
            <StatCard label="At Risk (< 25%)" value={data.slaAtRisk}
              highlight={data.slaAtRisk > 0 ? 'orange' : undefined} />
            <StatCard
              label="Avg Resolution"
              value={formatHours(data.avgResolutionHours)}
              sub="last 30 days"
              highlight="indigo"
            />
            <StatCard
              label="Escalation Rate"
              value={`${data.escalationRate}%`}
              sub="last 30 days"
              highlight={data.escalationRate > 10 ? 'orange' : undefined}
            />
            <StatCard
              label="Reopen Rate"
              value={`${data.reopenRate}%`}
              sub="last 30 days"
              highlight={data.reopenRate > 5 ? 'yellow' : undefined}
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Section title="Open Tickets by Priority">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={priorityData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f2f2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#86868b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#86868b' }} />
                  <Tooltip
                    formatter={(v) => [v ?? 0, 'Tickets']}
                    cursor={{ fill: '#f5f5f7' }}
                    contentStyle={{ border: '1px solid #d2d2d7', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {priorityData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>

            <Section title="Agent Workload">
              {agentData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[220px] text-ink-muted gap-2">
                  <p className="text-sm">No agents yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={agentData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f2f2f7" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#86868b' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#86868b' }} width={70} />
                    <Tooltip
                      formatter={(v, name) => [v ?? 0, name ?? '']}
                      labelFormatter={(label) => {
                        const entry = agentData.find(a => a.name === String(label));
                        return entry?.fullName ?? String(label);
                      }}
                      cursor={{ fill: '#f5f5f7' }}
                      contentStyle={{ border: '1px solid #d2d2d7', borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Open"           fill="#0071e3" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Resolved Today" fill="#8e8e93" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>

            <Section title="Open Tickets by Category">
              {catData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[220px] text-ink-muted gap-2">
                  <p className="text-sm">No data yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={catData}
                      cx="50%"
                      cy="45%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {catData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => [v ?? 0, 'Tickets']}
                      contentStyle={{ border: '1px solid #d2d2d7', borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Section>
          </div>

          {/* Overdue device returns */}
          {overdueData && (
            <div className="bg-white rounded-xl border border-hair overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#f2f2f7]">
                <div>
                  <h2 className="text-[13px] font-semibold text-ink flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d4660c] inline-block" />
                    Overdue Device Returns
                  </h2>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Employees holding more than {overdueData.maxDevices} device(s)
                    · {overdueData.employees.length} employee{overdueData.employees.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {overdueData.employees.length === 0 ? (
                <div className="py-10 flex flex-col items-center text-ink-muted gap-2">
                  <svg className="w-8 h-8 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-[#1a7f4b]">All employees within device limits</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-hair">
                        {['Employee', 'Email', 'Devices Held', 'Last Reminder', 'Cycle'].map(h => (
                          <Th key={h}>{h}</Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f2f2f7]">
                      {overdueData.employees.map(emp => (
                        <tr key={emp.id} className="hover:bg-[#fafafa]">
                          <td className="px-4 py-3.5 font-medium text-ink whitespace-nowrap">{emp.name}</td>
                          <td className="px-4 py-3.5 text-ink-muted text-xs">{emp.email}</td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full
                              text-xs font-medium
                              ${emp.holdCount > overdueData.maxDevices + 1
                                ? 'bg-[#fff1f2] text-[#c0392b]'
                                : 'bg-[#fff2ea] text-[#b45309]'}`}>
                              {emp.holdCount} / {overdueData.maxDevices}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                            {emp.lastReminderAt
                              ? new Date(emp.lastReminderAt).toLocaleDateString('en-GB', {
                                  day: '2-digit', month: 'short', year: 'numeric',
                                })
                              : <span className="italic">Never</span>}
                          </td>
                          <td className="px-4 py-3.5">
                            {emp.lastReminderCycle ? (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full
                                text-xs font-medium
                                ${emp.lastReminderCycle === 1 ? 'bg-[#e0f0fe] text-[#0071e3]'
                                : emp.lastReminderCycle === 2 ? 'bg-[#fef9ec] text-[#b07800]'
                                : 'bg-[#fff1f2] text-[#c0392b]'}`}>
                                {emp.lastReminderCycle === 1 ? 'Nudge'
                                : emp.lastReminderCycle === 2 ? 'Firm'
                                : `Escalated (#${emp.lastReminderCycle})`}
                              </span>
                            ) : (
                              <span className="text-ink-muted text-xs">None sent</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Open tickets table */}
          <div className="bg-white rounded-xl border border-hair overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f2f2f7]">
              <div>
                <h2 className="text-[13px] font-semibold text-ink">All Open Tickets</h2>
                <p className="text-xs text-ink-muted mt-0.5">{openTickets.length} tickets</p>
              </div>
            </div>

            {tableLoading && (
              <div>{Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)}</div>
            )}

            {!tableLoading && openTickets.length === 0 && (
              <div className="py-20 flex flex-col items-center text-ink-muted gap-3">
                <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium">No open tickets</p>
              </div>
            )}

            {!tableLoading && openTickets.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-hair">
                      <Th>Ticket ID</Th>
                      <Th>Subject</Th>
                      <Th>Category</Th>
                      <Th>Priority</Th>
                      <Th>Status</Th>
                      <Th>Assignee</Th>
                      <Th onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} sortDir={sortDir}>
                        SLA Due
                      </Th>
                      <Th>Created</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f2f2f7]">
                    {openTickets.map(ticket => (
                      <tr key={ticket.id} className="hover:bg-[#fafafa]">
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <Link to={`/tickets/${ticket.id}`}>
                            <TicketId id={ticket.id} />
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 max-w-[220px]">
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
                          {ticket.assignee?.name ?? (
                            <span className="italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 min-w-[140px]">
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
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

// ── EMPLOYEE dashboard ─────────────────────────────────────────────────────────

interface MyTicket { id: string; status: string; priority: string }
interface MyTicketsRes { data: MyTicket[]; total: number }
interface MyDeviceReq { id: string; status: string }

function EmployeeDashboard() {
  const { data: ticketsRes } = useQuery<MyTicketsRes>({
    queryKey: ['my-tickets-dashboard'],
    queryFn: () => api.get<MyTicketsRes>('/tickets', { params: { limit: 100 } }).then(r => r.data),
    refetchInterval: 60_000,
  });
  const { data: deviceReqs = [] } = useQuery<MyDeviceReq[]>({
    queryKey: ['my-device-reqs-dashboard'],
    queryFn: () => api.get<{ data: MyDeviceReq[] }>('/device-requests', { params: { limit: 100 } }).then(r => r.data.data),
    refetchInterval: 60_000,
  });

  const OPEN = new Set(['NEW', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'ESCALATED', 'REOPENED']);
  const myTickets     = ticketsRes?.data ?? [];
  const openCount     = myTickets.filter(t => OPEN.has(t.status)).length;
  const resolvedCount = myTickets.filter(t => t.status === 'RESOLVED').length;
  const activeDevices = deviceReqs.filter(r => r.status === 'ALLOCATED').length;

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted mt-0.5">Your personal overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Open Tickets"     value={openCount}     highlight={openCount > 0 ? 'orange' : undefined} />
        <StatCard label="Resolved Tickets" value={resolvedCount} highlight="indigo" />
        <StatCard label="Active Devices"   value={activeDevices} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/tickets/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600
                     text-white text-sm font-medium hover:bg-indigo-700"
        >
          + Raise a Ticket
        </Link>
        <Link
          to="/devices/request"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-hair
                     text-ink-soft text-sm font-medium hover:bg-[#fafafa]"
        >
          Request a Device
        </Link>
        <Link
          to="/tickets"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-hair
                     text-ink-soft text-sm font-medium hover:bg-[#fafafa]"
        >
          View My Tickets
        </Link>
      </div>
    </Layout>
  );
}

// ── AGENT / L2_L3 dashboard ────────────────────────────────────────────────────

function AgentDashboard() {
  const { data: ticketsRes } = useQuery<MyTicketsRes>({
    queryKey: ['agent-tickets-dashboard'],
    queryFn: () => api.get<MyTicketsRes>('/tickets', { params: { limit: 100 } }).then(r => r.data),
    refetchInterval: 60_000,
  });

  const OPEN = new Set(['NEW', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'ESCALATED', 'REOPENED']);
  const tickets     = ticketsRes?.data ?? [];
  const openTickets = tickets.filter(t => OPEN.has(t.status));
  const byStatus    = openTickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const critical = openTickets.filter(t => t.priority === 'CRITICAL').length;
  const high     = openTickets.filter(t => t.priority === 'HIGH').length;

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted mt-0.5">Your queue summary</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Open in Queue"  value={openTickets.length} highlight={openTickets.length > 0 ? 'orange' : undefined} />
        <StatCard label="Critical"       value={critical}           highlight={critical > 0 ? 'red' : undefined} />
        <StatCard label="High"           value={high}               highlight={high > 0 ? 'orange' : undefined} />
        <StatCard label="Total Assigned" value={tickets.length} />
      </div>

      {Object.keys(byStatus).length > 0 && (
        <div className="bg-white rounded-xl border border-hair p-5 mb-6">
          <h2 className="text-[13px] font-semibold text-ink mb-3">Open by Status</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byStatus).map(([status, count]) => (
              <span key={status}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
                           ${STATUS_STYLES[status] ?? 'bg-[#f2f2f7] text-[#6e6e73]'}`}>
                {status.replace(/_/g, ' ')} · {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <Link
        to="/agent/tickets"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600
                   text-white text-sm font-medium hover:bg-indigo-700"
      >
        Open My Queue →
      </Link>
    </Layout>
  );
}

// ── MANAGER dashboard ──────────────────────────────────────────────────────────

interface DevReq   { id: string; status: string }
interface PurchReq { id: string; status: string; estCost: string }

function ManagerDashboard() {
  const { data: deviceReqs = [] } = useQuery<DevReq[]>({
    queryKey: ['mgr-device-reqs'],
    queryFn: () =>
      api.get<{ data: DevReq[] }>('/device-requests', { params: { status: 'PENDING_MANAGER_APPROVAL', limit: 100 } })
        .then(r => r.data.data),
    refetchInterval: 60_000,
  });
  const { data: purchReqs = [] } = useQuery<PurchReq[]>({
    queryKey: ['mgr-purch-reqs'],
    queryFn: () => api.get<{ data: PurchReq[] }>('/purchase-requests', { params: { limit: 100 } }).then(r => r.data.data),
    refetchInterval: 60_000,
  });
  const { data: ticketsRes } = useQuery<MyTicketsRes>({
    queryKey: ['mgr-own-tickets'],
    queryFn: () => api.get<MyTicketsRes>('/tickets', { params: { limit: 100 } }).then(r => r.data),
    refetchInterval: 60_000,
  });

  const OPEN = new Set(['NEW', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'ESCALATED', 'REOPENED']);
  const pendingPrs   = purchReqs.filter(p =>
    p.status === 'PENDING_MANAGER_APPROVAL' || p.status === 'PENDING_FINANCE_APPROVAL',
  ).length;
  const pendingTotal = deviceReqs.length + pendingPrs;
  const openMyTickets = (ticketsRes?.data ?? []).filter(t => OPEN.has(t.status)).length;

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted mt-0.5">Approvals & team overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Pending Approvals"
          value={pendingTotal}
          highlight={pendingTotal > 0 ? 'yellow' : undefined}
          sub="device + purchase requests"
        />
        <StatCard label="Device Req. Pending" value={deviceReqs.length} />
        <StatCard label="My Open Tickets"     value={openMyTickets} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/manager/approvals"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600
                     text-white text-sm font-medium hover:bg-indigo-700"
        >
          Review Approvals →
        </Link>
        <Link
          to="/tickets"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-hair
                     text-ink-soft text-sm font-medium hover:bg-[#fafafa]"
        >
          My Tickets
        </Link>
      </div>
    </Layout>
  );
}

// ── FINANCE dashboard ──────────────────────────────────────────────────────────

function FinanceDashboard() {
  const { data: purchReqs = [] } = useQuery<PurchReq[]>({
    queryKey: ['finance-purch-reqs'],
    queryFn: () => api.get<{ data: PurchReq[] }>('/purchase-requests', { params: { limit: 100 } }).then(r => r.data.data),
    refetchInterval: 60_000,
  });

  const TERMINAL       = new Set(['RECEIVED', 'REJECTED']);
  const pendingFinance = purchReqs.filter(p => p.status === 'PENDING_FINANCE_APPROVAL').length;
  const pipelineValue  = purchReqs
    .filter(p => !TERMINAL.has(p.status))
    .reduce((sum, p) => sum + parseFloat(p.estCost || '0'), 0);

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-muted mt-0.5">Procurement finance overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <StatCard
          label="Pending Finance Approvals"
          value={pendingFinance}
          highlight={pendingFinance > 0 ? 'yellow' : undefined}
        />
        <StatCard
          label="Active Pipeline Value"
          value={`₹${pipelineValue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          highlight="indigo"
          sub="active purchase requests"
        />
      </div>

      <Link
        to="/finance/approvals"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600
                   text-white text-sm font-medium hover:bg-indigo-700"
      >
        Review Finance Approvals →
      </Link>
    </Layout>
  );
}

// ── Role router ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];

  const isAdmin   = roles.some(r => ['IT_ADMIN', 'SYS_ADMIN'].includes(r));
  const isAgent   = roles.some(r => ['AGENT', 'L2_L3'].includes(r));
  const isManager = roles.includes('MANAGER');
  const isFinance = roles.includes('FINANCE');

  if (isAdmin)   return <AdminDashboard />;
  if (isAgent)   return <AgentDashboard />;
  if (isManager) return <ManagerDashboard />;
  if (isFinance) return <FinanceDashboard />;
  return <EmployeeDashboard />;
}
