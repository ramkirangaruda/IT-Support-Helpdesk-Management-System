import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { useAuth } from '../../auth/useAuth';

const ALL_ROLES = [
  { value: 'EMPLOYEE',  label: 'Employee' },
  { value: 'AGENT',     label: 'Agent' },
  { value: 'L2_L3',     label: 'L2/L3 Engineer' },
  { value: 'IT_ADMIN',  label: 'IT Admin' },
  { value: 'MANAGER',   label: 'Manager' },
  { value: 'FINANCE',   label: 'Finance' },
  { value: 'SYS_ADMIN', label: 'System Admin' },
];

interface ManagedUser {
  id:            string;
  name:          string;
  email:         string;
  department:    string | null;
  accountStatus: string;
  status:        string;
  createdAt:     string;
  roles:         string[];
}

type TabKey = 'all' | 'pending' | 'active';
const TABS: { key: TabKey; label: string; param?: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'pending', label: 'Pending', param: 'PENDING_APPROVAL' },
  { key: 'active',  label: 'Active',  param: 'ACTIVE' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function errMsg(err: unknown, fallback: string) {
  const raw = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(raw) ? raw.join('. ') : (raw ?? fallback);
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-hair overflow-hidden animate-pulse">
      <div className="border-b border-hair h-10" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-6 px-4 py-3.5 border-b border-[#f2f2f7] last:border-0">
          <div className="h-4 w-28 bg-[#f2f2f7] rounded" />
          <div className="h-4 w-36 bg-[#f2f2f7] rounded" />
          <div className="h-4 w-16 bg-[#f2f2f7] rounded" />
          <div className="h-4 w-20 bg-[#f2f2f7] rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSysAdmin = !!user?.roles.includes('SYS_ADMIN');
  const assignable = isSysAdmin ? ALL_ROLES : ALL_ROLES.filter(r => r.value !== 'SYS_ADMIN');

  const [tab,    setTab]    = useState<TabKey>('all');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [toast,  setToast]  = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function flash(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  }

  const param = TABS.find(t => t.key === tab)?.param;
  const { data: users = [], isLoading } = useQuery<ManagedUser[]>({
    queryKey: ['admin-users', tab],
    queryFn: () =>
      api.get<ManagedUser[]>('/admin/users', { params: param ? { accountStatus: param } : {} }).then(r => r.data),
    refetchInterval: 30_000,
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/admin/users/${id}/role`, { role }).then(r => r.data),
    onSuccess: (data: { message?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      flash('ok', data?.message ?? 'Role updated');
    },
    onError: (e) => flash('err', errMsg(e, 'Role update failed')),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/users/${id}/deactivate`).then(r => r.data),
    onSuccess: (data: { message?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      flash('ok', data?.message ?? 'User deactivated');
    },
    onError: (e) => flash('err', errMsg(e, 'Deactivation failed')),
  });

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-ink">User Management</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Assign roles to users and manage account access. Assigning a role to a pending user grants them login access.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-5 border-b border-hair">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors
              ${tab === t.key
                ? 'border-b-2 border-indigo-600 text-indigo-600 -mb-px'
                : 'text-ink-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-2">
          <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm font-medium">No users in this view</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-hair overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-hair">
                {['Name', 'Email', 'Current Role', 'Registered', 'Assign Role', 'Actions'].map(h => (
                  <th key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                               uppercase tracking-[0.06em] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f2f7]">
              {users.map(u => {
                const isPending   = u.accountStatus === 'PENDING_APPROVAL';
                const isInactive  = u.status !== 'ACTIVE';
                const isSelf      = u.id === user?.sub;
                const targetIsSys = u.roles.includes('SYS_ADMIN');
                const locked      = isSelf || (targetIsSys && !isSysAdmin);
                const selected    = picked[u.id] ?? '';
                return (
                  <tr
                    key={u.id}
                    className={
                      isPending  ? 'border-l-2 border-l-[#b07800] hover:bg-[#fafafa]' :
                      isInactive ? 'opacity-60 bg-[#fafafa]' :
                                   'hover:bg-[#fafafa]'
                    }
                  >
                    <td className="px-4 py-3.5 font-medium text-ink">
                      {u.name}
                      {isSelf && <span className="ml-1 text-xs text-ink-muted">(you)</span>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-ink-muted">{u.email}</td>
                    <td className="px-4 py-3.5">
                      {isPending ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                         bg-[#fef9ec] text-[#b07800] border border-[#f0d870]">
                          Pending
                        </span>
                      ) : u.roles.length ? (
                        <span className="text-sm text-ink-soft">{u.roles.join(', ')}</span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                      {isInactive && <span className="ml-2 text-xs text-ink-muted">(inactive)</span>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-ink-muted whitespace-nowrap">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <select
                          value={selected}
                          disabled={locked}
                          onChange={e => setPicked(p => ({ ...p, [u.id]: e.target.value }))}
                          className="rounded-lg border border-hair px-2 py-1.5 text-xs bg-white text-ink
                                     focus:outline-none focus:border-2 focus:border-indigo-600
                                     disabled:bg-[#f2f2f7] disabled:text-ink-muted"
                        >
                          <option value="">Select role…</option>
                          {assignable.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <button
                          disabled={!selected || locked || assignMutation.isPending}
                          onClick={() => assignMutation.mutate({ id: u.id, role: selected })}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white
                                     hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Assign
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {isSysAdmin && !isSelf && u.status === 'ACTIVE' && (
                        <button
                          onClick={() => {
                            if (confirm(`Deactivate ${u.email}? They will be unable to log in.`)) {
                              deactivateMutation.mutate(u.id);
                            }
                          }}
                          disabled={deactivateMutation.isPending}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#fff1f2] text-[#c0392b]
                                     border border-[#fecdd3] hover:bg-[#ffe4e6] disabled:opacity-40"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium
          ${toast.kind === 'ok'
            ? 'bg-[#1a7f4b] text-white'
            : 'bg-[#c0392b] text-white'}`}>
          {toast.text}
        </div>
      )}
    </Layout>
  );
}
