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
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Modal({ title, sub, children, onCancel, disabled }: {
  title:    string;
  sub:      string;
  children: React.ReactNode;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-hair w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-ink mb-1">{title}</h2>
        <p className="text-sm text-ink-muted mb-5">{sub}</p>
        {children}
        <button
          onClick={onCancel}
          disabled={disabled}
          className="mt-3 w-full py-2 rounded-lg border border-hair text-sm text-ink-soft
                     hover:bg-[#fafafa] disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Approve panel ─────────────────────────────────────────────────────────────

function ApprovePanel({ user, onClose }: { user: PendingUser; onClose: () => void }) {
  const queryClient    = useQueryClient();
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['EMPLOYEE']);
  const [error,         setError]         = useState<string | null>(null);

  function toggleRole(role: string) {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role],
    );
  }

  const mutation = useMutation({
    mutationFn: () => api.post(`/admin/pending-users/${user.id}/approve`, { roles: selectedRoles }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['pending-users'] }); onClose(); },
    onError: (err: unknown) => {
      const raw = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(raw) ? raw.join('. ') : (raw ?? 'Approval failed'));
    },
  });

  return (
    <Modal
      title="Approve account"
      sub={`${user.name} <${user.email}>`}
      onCancel={onClose}
      disabled={mutation.isPending}
    >
      <p className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-2">
        Assign roles <span className="text-[#c0392b] font-normal">(select at least one)</span>
      </p>
      <div className="space-y-2 mb-4">
        {ALL_ROLES.map(r => (
          <label key={r.value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedRoles.includes(r.value)}
              onChange={() => toggleRole(r.value)}
              className="rounded border-hair text-indigo-600"
            />
            <span className="text-sm text-ink-soft">{r.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-3 py-2 mb-4">
          <p className="text-xs text-[#c0392b]">{error}</p>
        </div>
      )}
      <button
        onClick={() => mutation.mutate()}
        disabled={selectedRoles.length === 0 || mutation.isPending}
        className="w-full py-2 rounded-lg bg-[#1a7f4b] text-white text-sm font-medium
                   hover:bg-[#166940] disabled:opacity-50"
      >
        {mutation.isPending ? 'Approving…' : 'Approve & Assign Roles'}
      </button>
    </Modal>
  );
}

// ── Reject panel ──────────────────────────────────────────────────────────────

function RejectPanel({ user, onClose }: { user: PendingUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error,  setError]  = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post(`/admin/pending-users/${user.id}/reject`, { reason }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['pending-users'] }); onClose(); },
    onError: (err: unknown) => {
      const raw = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(raw) ? raw.join('. ') : (raw ?? 'Rejection failed'));
    },
  });

  return (
    <Modal
      title="Reject account"
      sub={`${user.name} <${user.email}>`}
      onCancel={onClose}
      disabled={mutation.isPending}
    >
      <label className="block text-sm font-medium text-ink-soft mb-1">
        Reason <span className="text-[#c0392b]">*</span>
        <span className="text-ink-muted font-normal text-xs ml-1">(sent to the user)</span>
      </label>
      <textarea
        rows={3}
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="e.g. Cannot verify employment status. Please contact IT."
        className="w-full rounded-lg border border-hair px-3 py-2 text-sm text-ink
                   focus:outline-none focus:border-2 focus:border-indigo-600 resize-none mb-4"
      />
      {error && (
        <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-3 py-2 mb-4">
          <p className="text-xs text-[#c0392b]">{error}</p>
        </div>
      )}
      <button
        onClick={() => mutation.mutate()}
        disabled={!reason.trim() || mutation.isPending}
        className="w-full py-2 rounded-lg bg-[#c0392b] text-white text-sm font-medium
                   hover:bg-[#a83228] disabled:opacity-50"
      >
        {mutation.isPending ? 'Rejecting…' : 'Reject Registration'}
      </button>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPendingUsersPage() {
  const [approving, setApproving] = useState<PendingUser | null>(null);
  const [rejecting, setRejecting] = useState<PendingUser | null>(null);

  const { data: users = [], isLoading } = useQuery<PendingUser[]>({
    queryKey: ['pending-users'],
    queryFn:  () => api.get<PendingUser[]>('/admin/pending-users').then(r => r.data),
    refetchInterval: 30_000,
  });

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">Pending User Approvals</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Review self-registered accounts. Approving assigns roles and grants login access.
        </p>
      </div>

      {isLoading && (
        <div className="bg-white rounded-xl border border-hair p-8 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-3.5 border-b border-[#f2f2f7] last:border-0">
              <div className="h-4 w-32 bg-[#f2f2f7] rounded" />
              <div className="h-4 w-40 bg-[#f2f2f7] rounded" />
              <div className="h-4 w-20 bg-[#f2f2f7] rounded" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && users.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-3">
          <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">No pending registrations</p>
          <p className="text-xs">All accounts have been reviewed.</p>
        </div>
      )}

      {!isLoading && users.length > 0 && (
        <div className="bg-white rounded-xl border border-hair overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-hair">
                {['Name', 'Email', 'Department', 'Registered', 'Actions'].map(h => (
                  <th key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                               uppercase tracking-[0.06em] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f2f7]">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-[#fafafa]">
                  <td className="px-4 py-3.5 font-medium text-ink">{u.name}</td>
                  <td className="px-4 py-3.5 text-ink-muted text-xs">{u.email}</td>
                  <td className="px-4 py-3.5 text-ink-muted text-xs">{u.department ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-ink-muted whitespace-nowrap">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setApproving(u)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#eafaf3] text-[#1a7f4b]
                                   border border-[#a3d9b8] hover:bg-[#d4f0e3]"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setRejecting(u)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#fff1f2] text-[#c0392b]
                                   border border-[#fecdd3] hover:bg-[#ffe4e6]"
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

      {approving && <ApprovePanel user={approving} onClose={() => setApproving(null)} />}
      {rejecting && <RejectPanel  user={rejecting} onClose={() => setRejecting(null)} />}
    </Layout>
  );
}
