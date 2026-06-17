import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

const ALL_ROLES = [
  { value: 'EMPLOYEE',  label: 'Employee' },
  { value: 'AGENT',     label: 'Agent' },
  { value: 'L2_L3',     label: 'L2/L3 Engineer' },
  { value: 'IT_ADMIN',  label: 'IT Admin' },
  { value: 'MANAGER',   label: 'Manager' },
  { value: 'FINANCE',   label: 'Finance' },
  { value: 'SYS_ADMIN', label: 'System Admin' },
];

interface PendingUser {
  id:            string;
  name:          string;
  email:         string;
  department:    string | null;
  accountStatus: string;
  createdAt:     string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

// ── Approve panel ────────────────────────────────────────────────────────────

function ApprovePanel({
  user,
  onClose,
}: {
  user: PendingUser;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['EMPLOYEE']);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: string) {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role],
    );
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/pending-users/${user.id}/approve`, { roles: selectedRoles }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      onClose();
    },
    onError: (err: unknown) => {
      const raw =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(Array.isArray(raw) ? raw.join('. ') : (raw ?? 'Approval failed'));
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Approve account</h2>
        <p className="text-sm text-gray-500 mb-4">
          {user.name} &lt;{user.email}&gt;
        </p>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Assign roles <span className="text-red-500 font-normal">(select at least one)</span>
        </p>
        <div className="space-y-2 mb-4">
          {ALL_ROLES.map(r => (
            <label key={r.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedRoles.includes(r.value)}
                onChange={() => toggleRole(r.value)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">{r.label}</span>
            </label>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-4">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => mutation.mutate()}
            disabled={selectedRoles.length === 0 || mutation.isPending}
            className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-medium
                       hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? 'Approving…' : 'Approve & Assign Roles'}
          </button>
          <button
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                       hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reject panel ─────────────────────────────────────────────────────────────

function RejectPanel({
  user,
  onClose,
}: {
  user: PendingUser;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error,  setError]  = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/pending-users/${user.id}/reject`, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-users'] });
      onClose();
    },
    onError: (err: unknown) => {
      const raw =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      setError(Array.isArray(raw) ? raw.join('. ') : (raw ?? 'Rejection failed'));
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Reject account</h2>
        <p className="text-sm text-gray-500 mb-4">
          {user.name} &lt;{user.email}&gt;
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reason <span className="text-red-500">*</span>
          <span className="text-gray-400 font-normal text-xs ml-1">(sent to the user)</span>
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Cannot verify employment status. Please contact IT."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none mb-4"
        />

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-4">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => mutation.mutate()}
            disabled={!reason.trim() || mutation.isPending}
            className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium
                       hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? 'Rejecting…' : 'Reject Registration'}
          </button>
          <button
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                       hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPendingUsersPage() {
  const [approving, setApproving] = useState<PendingUser | null>(null);
  const [rejecting, setRejecting] = useState<PendingUser | null>(null);

  const { data: users = [], isLoading } = useQuery<PendingUser[]>({
    queryKey: ['pending-users'],
    queryFn: () => api.get<PendingUser[]>('/admin/pending-users').then(r => r.data),
    refetchInterval: 30_000,
  });

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Pending User Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review self-registered accounts. Approving assigns roles and grants login access.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm font-medium text-gray-500">No pending registrations</p>
          <p className="text-xs mt-1">All accounts have been reviewed.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Email', 'Department', 'Registered', 'Actions'].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{u.department ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setApproving(u)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700
                                   border border-green-200 hover:bg-green-100 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setRejecting(u)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700
                                   border border-red-200 hover:bg-red-100 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {approving && (
        <ApprovePanel user={approving} onClose={() => setApproving(null)} />
      )}
      {rejecting && (
        <RejectPanel user={rejecting} onClose={() => setRejecting(null)} />
      )}
    </Layout>
  );
}
