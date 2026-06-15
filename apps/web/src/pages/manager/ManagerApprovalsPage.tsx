import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeviceRequest {
  id: string;
  deviceType: string;
  justification: string;
  status: string;
  comment: string | null;
  createdAt: string;
  requester: { id: string; name: string; email: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Reject Reason Inline Panel ────────────────────────────────────────────────

function RejectPanel({
  requestId,
  onSuccess,
  onCancel,
}: {
  requestId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const rejectMutation = useMutation({
    mutationFn: () =>
      api.post(`/device-requests/${requestId}/decision`, {
        decision: 'REJECTED',
        comment,
      }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      onSuccess();
    },
  });

  function handleSubmit() {
    if (!comment.trim()) {
      setError('A reason is required when rejecting a request.');
      return;
    }
    setError('');
    rejectMutation.mutate();
  }

  return (
    <div className="p-4 bg-red-50 border-t border-red-100">
      <p className="text-xs font-semibold text-red-700 mb-2">Rejection reason (required)</p>
      <textarea
        value={comment}
        onChange={e => { setComment(e.target.value); setError(''); }}
        rows={2}
        placeholder="Explain why this request is being rejected…"
        className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {rejectMutation.isError && (
        <p className="text-xs text-red-600 mt-1">Failed to reject. Please try again.</p>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSubmit}
          disabled={rejectMutation.isPending}
          className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold
                     hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-red-200 text-xs text-red-700
                     hover:bg-red-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ManagerApprovalsPage() {
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery<DeviceRequest[]>({
    queryKey: ['pending-approvals'],
    queryFn: () =>
      api.get<DeviceRequest[]>('/device-requests', {
        params: { status: 'PENDING_MANAGER_APPROVAL' },
      }).then(r => r.data),
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/device-requests/${id}/decision`, { decision: 'APPROVED' }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-approvals'] }),
  });

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Device Request Approvals</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Review and approve or reject device requests from your team
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>
      )}

      {!isLoading && requests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">No pending approvals</p>
          <p className="text-xs text-gray-400 mt-1">All device requests have been reviewed</p>
        </div>
      )}

      {!isLoading && requests.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-xs font-semibold text-yellow-800">
              {requests.length} request{requests.length !== 1 ? 's' : ''} awaiting your approval
            </span>
          </div>

          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Requester', 'Device Type', 'Justification', 'Raised', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map(req => (
                <>
                  <tr key={req.id} className={`transition-colors ${rejectingId === req.id ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{req.requester.name}</p>
                      <p className="text-xs text-gray-400">{req.requester.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200
                                       text-indigo-700 text-xs font-semibold">
                        {req.deviceType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-sm">
                      <span className="line-clamp-3">{req.justification}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(req.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveMutation.mutate(req.id)}
                          disabled={approveMutation.isPending || rejectingId === req.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600
                                     text-white hover:bg-green-700 transition-colors disabled:opacity-40"
                        >
                          {approveMutation.isPending ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() =>
                            setRejectingId(rejectingId === req.id ? null : req.id)
                          }
                          disabled={approveMutation.isPending}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                            disabled:opacity-40 ${
                              rejectingId === req.id
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'border border-red-300 text-red-700 hover:bg-red-50'
                            }`}
                        >
                          {rejectingId === req.id ? 'Cancel' : 'Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {rejectingId === req.id && (
                    <tr key={`reject-${req.id}`}>
                      <td colSpan={5} className="p-0">
                        <RejectPanel
                          requestId={req.id}
                          onSuccess={() => setRejectingId(null)}
                          onCancel={() => setRejectingId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
