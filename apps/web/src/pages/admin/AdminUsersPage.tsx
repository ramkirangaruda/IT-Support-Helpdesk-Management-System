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

export default function AdminUsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSysAdmin = !!user?.roles.includes('SYS_ADMIN');
  const assignable = isSysAdmin ? ALL_ROLES : ALL_ROLES.filter(r => r.value !== 'SYS_ADMIN');

  const [tab, setTab] = useState<TabKey>('all');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

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
        <h1 className="text-xl font-bold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500 mt-1">
          Assign roles to users and manage account access. Assigning a role to a pending user grants them login access.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
              tab === t.key
                ? 'bg-white border-gray-200 text-indigo-600 -mb-px'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm font-medium text-gray-500">No users in this view</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Email', 'Current Role', 'Registered', 'Assign Role', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => {
                const isPending  = u.accountStatus === 'PENDING_APPROVAL';
                const isInactive = u.status !== 'ACTIVE';
                const isSelf     = u.id === user?.sub;
                const targetIsSys = u.roles.includes('SYS_ADMIN');
                const lockedTarget = isSelf || (targetIsSys && !isSysAdmin);
                const selected = picked[u.id] ?? '';
                return (
                  <tr key={u.id} className={isPending ? 'bg-amber-50' : isInactive ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {u.name}{isSelf && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      {isPending ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                          PENDING
                        </span>
                      ) : u.roles.length ? (
                        <span className="text-sm text-gray-700">{u.roles.join(', ')}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                      {isInactive && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={selected}
                          disabled={lockedTarget}
                          onChange={e => setPicked(p => ({ ...p, [u.id]: e.target.value }))}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-xs bg-white
                                     focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                        >
                          <option value="">Select role…</option>
                          {assignable.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <button
                          disabled={!selected || lockedTarget || assignMutation.isPending}
                          onClick={() => assignMutation.mutate({ id: u.id, role: selected })}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-600 text-white
                                     hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Assign
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isSysAdmin && !isSelf && u.status === 'ACTIVE' && (
                        <button
                          onClick={() => {
                            if (confirm(`Deactivate ${u.email}? They will be unable to log in.`)) {
                              deactivateMutation.mutate(u.id);
                            }
                          }}
                          disabled={deactivateMutation.isPending}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-700
                                     border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-40"
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

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.kind === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.text}
        </div>
      )}
    </Layout>
  );
}
