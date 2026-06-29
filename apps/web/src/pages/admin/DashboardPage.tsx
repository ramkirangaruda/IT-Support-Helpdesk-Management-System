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
  openByStatus:      Record<string, number>;
  openByPriority:    Record<string, number>;
  slaBreached:       number;
  slaAtRisk:         number;
  avgResolutionHours: number;
  escalationRate:    number;
  reopenRate:        number;
  topCategories:     { name: string; count: number }[];
  agentWorkload:     { agentName: string; open: number; resolved_today: number }[];
}

interface TicketRow extends SlaFields {
  id:          string;
  subject:     string;
  priority:    string;
  status:      string;
  category:    { id: string; name: string } | null;
  assignee:    { id: string; name: string; email: string } | null;
  requester:   { id: string; name: string; email: string };
  createdAt:   string;
  resolvedAt:  string | null;
}

interface TicketsResponse {
  data:  TicketRow[];
  total: number;
  page:  number;
  limit: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_BARS = [
  { key: 'CRITICAL', fill: '#ef4444' },
  { key: 'HIGH',     fill: '#f97316' },
  { key: 'MEDIUM',   fill: '#3b82f6' },
  { key: 'LOW',      fill: '#9ca3af' },
];

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

const PRIORITY_STYLES: Record<string, string> = {
  LOW:      'bg-gray-100 text-gray-600',
  MEDIUM:   'bg-blue-100 text-blue-700',
  HIGH:     'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

const STATUS_STYLES: Record<string, string> = {
  NEW:         'bg-blue-50 text-blue-700 border border-blue-200',
  ASSIGNED:    'bg-blue-50 text-blue-600 border border-blue-200',
  IN_PROGRESS: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  ON_HOLD:     'bg-gray-100 text-gray-600 border border-gray-200',
  ESCALATED:   'bg-purple-50 text-purple-700 border border-purple-200',
  REOPENED:    'bg-orange-50 text-orange-700 border border-orange-200',
};

const OPEN_STATUSES = new Set(['NEW', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'ESCALATED', 'REOPENED']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ label, styleMap }: { label: string; styleMap: Record<string, string> }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${styleMap[label] ?? 'bg-gray-100 text-gray-600'}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function formatHours(h: number): string {
  if (h === 0) return '—';
  if (h < 24) return `${h}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: 'red' | 'orange' | 'yellow' | 'indigo';
}) {
  const border = highlight === 'red'    ? 'border-red-200'
    : highlight === 'orange'  ? 'border-orange-200'
    : highlight === 'yellow'  ? 'border-yellow-200'
    : highlight === 'indigo'  ? 'border-indigo-200'
    : 'border-gray-200';
  const numCls = highlight === 'red'    ? 'text-red-600'
    : highlight === 'orange'  ? 'text-orange-600'
    : highlight === 'yellow'  ? 'text-yellow-700'
    : highlight === 'indigo'  ? 'text-indigo-600'
    : 'text-gray-900';

  return (
    <div className={`bg-white rounded-xl border ${border} p-4 flex flex-col gap-1`}>
      <span className={`text-2xl font-bold tabular-nums leading-none ${numCls}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
      <span className="text-xs text-gray-500 font-medium mt-0.5">{label}</span>
    </div>
  );
}

// ── SLA bar (reused from admin queue) ─────────────────────────────────────────

function SlaBar({ ticket }: { ticket: SlaFields }) {
  const pct   = computeSlaPercent(ticket);
  const color = slaColor(pct);
  const barCls = color === 'green'  ? 'bg-green-500'
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

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';

function AdminDashboard() {
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo,   setExportTo]   = useState('');
  const [sortDir,    setSortDir]    = useState<SortDir>('asc');
  const [exporting,  setExporting]  = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────

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
      api.get<{ id: string; status: string; estCost: string }[]>('/purchase-requests').then(r => r.data),
    refetchInterval: 60_000,
  });

  const { data: pendingDeviceReqs = [] } = useQuery<{ id: string }[]>({
    queryKey: ['dashboard-pending-devices'],
    queryFn:  () =>
      api.get<{ id: string }[]>('/device-requests', { params: { status: 'PENDING_MANAGER_APPROVAL' } })
        .then(r => r.data),
    refetchInterval: 60_000,
  });

  // ── Derived chart data ────────────────────────────────────────────────────

  const priorityData = PRIORITY_BARS.map(b => ({
    name:  b.key,
    count: data?.openByPriority[b.key] ?? 0,
    fill:  b.fill,
  }));

  const agentData = (data?.agentWorkload ?? []).map(a => ({
    name:           a.agentName.split(' ')[0],  // first name only for axis space
    fullName:       a.agentName,
    Open:           a.open,
    'Resolved Today': a.resolved_today,
  }));

  const catData = (data?.topCategories ?? []).map(c => ({
    name:  c.name,
    value: c.count,
  }));

  // Open count = sum of all openByStatus values
  const totalOpen = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.openByStatus).reduce((s, n) => s + n, 0);
  }, [data]);

  // Procurement summary
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

  // Sorted open tickets table
  const openTickets = useMemo(() => {
    const rows = (openTicketsRes?.data ?? []).filter(t => OPEN_STATUSES.has(t.status));
    return [...rows].sort((a, b) => {
      const aD = a.slaResolutionDue ? new Date(a.slaResolutionDue).getTime() : Infinity;
      const bD = b.slaResolutionDue ? new Date(b.slaResolutionDue).getTime() : Infinity;
      return sortDir === 'asc' ? aD - bD : bD - aD;
    });
  }, [openTicketsRes, sortDir]);

  // ── Export handler ────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (exportFrom) params.set('from', exportFrom);
      if (exportTo)   params.set('to',   exportTo);
      const res = await api.get<Blob>(`/reports/export?${params}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href    = url;
      a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live metrics · refreshes every 60 s</p>
        </div>

        {/* CSV Export */}
        <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-xl p-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={exportFrom}
              onChange={e => setExportFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={exportTo}
              onChange={e => setExportTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium
                       hover:bg-indigo-700 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {exporting ? 'Exporting…' : '↓ Export CSV'}
          </button>
        </div>
      </div>

      {/* ── Procurement summary ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard
          label="Pending Approvals"
          value={pendingApprovals}
          sub="device + purchase requests"
          highlight={pendingApprovals > 0 ? 'yellow' : undefined}
        />
        <StatCard
          label="Pipeline Value"
          value={`£${pipelineValue.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          sub="active purchase requests"
          highlight="indigo"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          Loading metrics…
        </div>
      )}

      {!isLoading && data && (
        <div className="space-y-6">
          {/* ── 1. Top stats bar ─────────────────────────────────────────── */}
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

          {/* ── 2. Charts row ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 2a. Bar chart: open by priority */}
            <Section title="Open Tickets by Priority">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={priorityData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => [v ?? 0, 'Tickets']}
                    cursor={{ fill: '#f3f4f6' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {priorityData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>

            {/* 2b. Horizontal bar: agent workload */}
            <Section title="Agent Workload (Open Tickets)">
              {agentData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-16">No agents yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={agentData}
                    layout="vertical"
                    margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                    <Tooltip
                      formatter={(v, name) => [v ?? 0, name ?? '']}
                      labelFormatter={(label) => {
                        const key = String(label);
                        const entry = agentData.find(a => a.name === key);
                        return entry?.fullName ?? key;
                      }}
                      cursor={{ fill: '#f3f4f6' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Open"           fill="#6366f1" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Resolved Today" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>

            {/* 2c. Pie: tickets by category */}
            <Section title="Open Tickets by Category">
              {catData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-16">No data</p>
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
                    <Tooltip formatter={(v) => [v ?? 0, 'Tickets']} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Section>
          </div>

          {/* ── 3. Overdue device returns card ───────────────────────────── */}
          {overdueData && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                    Overdue Device Returns
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Employees holding more than {overdueData.maxDevices} device(s)
                    · {overdueData.employees.length} employee{overdueData.employees.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {overdueData.employees.length === 0 ? (
                <div className="py-10 flex flex-col items-center text-gray-400 gap-1">
                  <svg className="w-8 h-8 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-green-600">All employees within device limits</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Employee', 'Email', 'Devices Held', 'Last Reminder', 'Cycle'].map(h => (
                          <th key={h}
                            className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {overdueData.employees.map(emp => (
                        <tr key={emp.id} className="hover:bg-orange-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                            {emp.name}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{emp.email}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                              text-xs font-semibold
                              ${emp.holdCount > overdueData.maxDevices + 1
                                ? 'bg-red-100 text-red-700'
                                : 'bg-orange-100 text-orange-700'}`}>
                              {emp.holdCount} / {overdueData.maxDevices}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                            {emp.lastReminderAt
                              ? new Date(emp.lastReminderAt).toLocaleDateString('en-GB', {
                                  day: '2-digit', month: 'short', year: 'numeric',
                                })
                              : <span className="text-gray-400 italic">Never</span>}
                          </td>
                          <td className="px-4 py-3">
                            {emp.lastReminderCycle ? (
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold
                                ${emp.lastReminderCycle === 1 ? 'bg-blue-100 text-blue-700'
                                : emp.lastReminderCycle === 2 ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'}`}>
                                {emp.lastReminderCycle === 1 ? 'Nudge'
                                : emp.lastReminderCycle === 2 ? 'Firm'
                                : `Escalated (#${emp.lastReminderCycle})`}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">None sent</span>
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

          {/* ── 4. Open tickets table ─────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">All Open Tickets</h2>
                <p className="text-xs text-gray-400 mt-0.5">{openTickets.length} tickets</p>
              </div>
            </div>

            {tableLoading && (
              <div className="py-16 flex items-center justify-center text-sm text-gray-400">
                Loading tickets…
              </div>
            )}

            {!tableLoading && openTickets.length === 0 && (
              <div className="py-16 flex flex-col items-center text-gray-400 gap-2">
                <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium">No open tickets</p>
              </div>
            )}

            {!tableLoading && openTickets.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Ticket ID', 'Subject', 'Category', 'Priority', 'Status', 'Assignee'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                      {/* Sortable SLA column */}
                      <th
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase
                                   tracking-wider cursor-pointer select-none hover:text-indigo-600 group"
                        onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                      >
                        <span className="flex items-center gap-1">
                          SLA Due
                          <span className="text-gray-400 group-hover:text-indigo-500">
                            {sortDir === 'asc' ? '↑' : '↓'}
                          </span>
                        </span>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {openTickets.map(ticket => (
                      <tr key={ticket.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
                          <Link to={`/tickets/${ticket.id}`} className="hover:underline">
                            {ticket.id}
                          </Link>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <Link
                            to={`/tickets/${ticket.id}`}
                            className="font-medium text-gray-900 hover:text-indigo-600 line-clamp-1"
                          >
                            {ticket.subject}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {ticket.category?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge label={ticket.priority} styleMap={PRIORITY_STYLES} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge label={ticket.status} styleMap={STATUS_STYLES} />
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {ticket.assignee?.name ?? (
                            <span className="text-gray-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 min-w-[140px]">
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
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

// ── EMPLOYEE dashboard ─────────────────────────────────────────────────────

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
    queryFn: () => api.get<MyDeviceReq[]>('/device-requests').then(r => r.data),
    refetchInterval: 60_000,
  });

  const OPEN = new Set(['NEW', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'ESCALATED', 'REOPENED']);
  const myTickets = ticketsRes?.data ?? [];
  const openCount = myTickets.filter(t => OPEN.has(t.status)).length;
  const resolvedCount = myTickets.filter(t => t.status === 'RESOLVED').length;
  const activeDevices = deviceReqs.filter(r => r.status === 'ALLOCATED').length;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your personal overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Open Tickets"     value={openCount}     highlight={openCount > 0 ? 'orange' : undefined} />
        <StatCard label="Resolved Tickets" value={resolvedCount} highlight="indigo" />
        <StatCard label="Active Devices"   value={activeDevices} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/tickets/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600
                     text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + Raise a Ticket
        </Link>
        <Link
          to="/devices/request"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300
                     text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Request a Device
        </Link>
        <Link
          to="/tickets"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300
                     text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          View My Tickets
        </Link>
      </div>
    </Layout>
  );
}

// ── AGENT / L2_L3 dashboard ────────────────────────────────────────────────

function AgentDashboard() {
  const { data: ticketsRes } = useQuery<MyTicketsRes>({
    queryKey: ['agent-tickets-dashboard'],
    queryFn: () => api.get<MyTicketsRes>('/tickets', { params: { limit: 100 } }).then(r => r.data),
    refetchInterval: 60_000,
  });

  const OPEN = new Set(['NEW', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'ESCALATED', 'REOPENED']);
  const tickets = ticketsRes?.data ?? [];
  const openTickets = tickets.filter(t => OPEN.has(t.status));
  const byStatus = openTickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  const critical = openTickets.filter(t => t.priority === 'CRITICAL').length;
  const high     = openTickets.filter(t => t.priority === 'HIGH').length;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your queue summary</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Open in Queue"  value={openTickets.length} highlight={openTickets.length > 0 ? 'orange' : undefined} />
        <StatCard label="Critical"       value={critical}           highlight={critical > 0 ? 'red' : undefined} />
        <StatCard label="High"           value={high}               highlight={high > 0 ? 'orange' : undefined} />
        <StatCard label="Total Assigned" value={tickets.length} />
      </div>

      {Object.keys(byStatus).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Open by Status</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byStatus).map(([status, count]) => (
              <span key={status}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
                           bg-indigo-50 text-indigo-700 border border-indigo-100">
                {status.replace(/_/g, ' ')} · {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <Link
        to="/agent/tickets"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600
                   text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        Open My Queue →
      </Link>
    </Layout>
  );
}

// ── MANAGER dashboard ──────────────────────────────────────────────────────

interface DevReq { id: string; status: string }
interface PurchReq { id: string; status: string; estCost: string }

function ManagerDashboard() {
  const { data: deviceReqs = [] } = useQuery<DevReq[]>({
    queryKey: ['mgr-device-reqs'],
    queryFn: () =>
      api.get<DevReq[]>('/device-requests', { params: { status: 'PENDING_MANAGER_APPROVAL' } })
        .then(r => r.data),
    refetchInterval: 60_000,
  });
  const { data: purchReqs = [] } = useQuery<PurchReq[]>({
    queryKey: ['mgr-purch-reqs'],
    queryFn: () => api.get<PurchReq[]>('/purchase-requests').then(r => r.data),
    refetchInterval: 60_000,
  });
  const { data: ticketsRes } = useQuery<MyTicketsRes>({
    queryKey: ['mgr-own-tickets'],
    queryFn: () => api.get<MyTicketsRes>('/tickets', { params: { limit: 100 } }).then(r => r.data),
    refetchInterval: 60_000,
  });

  const OPEN = new Set(['NEW', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'ESCALATED', 'REOPENED']);
  const pendingPrs = purchReqs.filter(p =>
    p.status === 'PENDING_MANAGER_APPROVAL' || p.status === 'PENDING_FINANCE_APPROVAL',
  ).length;
  const pendingTotal = deviceReqs.length + pendingPrs;
  const openMyTickets = (ticketsRes?.data ?? []).filter(t => OPEN.has(t.status)).length;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Approvals & team overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending Approvals"     value={pendingTotal}    highlight={pendingTotal > 0 ? 'yellow' : undefined} sub="device + purchase requests" />
        <StatCard label="Device Req. Pending"   value={deviceReqs.length} />
        <StatCard label="My Open Tickets"       value={openMyTickets} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/manager/approvals"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600
                     text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Review Approvals →
        </Link>
        <Link
          to="/tickets"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300
                     text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          My Tickets
        </Link>
      </div>
    </Layout>
  );
}

// ── FINANCE dashboard ──────────────────────────────────────────────────────

function FinanceDashboard() {
  const { data: purchReqs = [] } = useQuery<PurchReq[]>({
    queryKey: ['finance-purch-reqs'],
    queryFn: () => api.get<PurchReq[]>('/purchase-requests').then(r => r.data),
    refetchInterval: 60_000,
  });

  const TERMINAL = new Set(['RECEIVED', 'REJECTED']);
  const pendingFinance = purchReqs.filter(p => p.status === 'PENDING_FINANCE_APPROVAL').length;
  const pipelineValue  = purchReqs
    .filter(p => !TERMINAL.has(p.status))
    .reduce((sum, p) => sum + parseFloat(p.estCost || '0'), 0);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Procurement finance overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard
          label="Pending Finance Approvals"
          value={pendingFinance}
          highlight={pendingFinance > 0 ? 'yellow' : undefined}
        />
        <StatCard
          label="Active Pipeline Value"
          value={`£${pipelineValue.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          highlight="indigo"
          sub="active purchase requests"
        />
      </div>

      <Link
        to="/finance/approvals"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600
                   text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        Review Finance Approvals →
      </Link>
    </Layout>
  );
}

// ── Role router ────────────────────────────────────────────────────────────

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
