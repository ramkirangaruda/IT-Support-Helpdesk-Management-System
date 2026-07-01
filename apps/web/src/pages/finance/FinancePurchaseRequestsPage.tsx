import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface PurchaseRequest {
  id: string;
  itemSpec: string;
  quantity: number;
  estCost: string;
  budgetCode: string;
  status: string;
  createdAt: string;
  raisedBy: { id: string; name: string; email: string };
  vendor: { id: string; name: string } | null;
  deviceRequest: {
    id: string;
    deviceType: string;
    requester: { id: string; name: string; email: string };
  } | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function RejectPanel({
  prId,
  onSuccess,
  onCancel,
}: {
  prId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/purchase-requests/${prId}/approve`, { decision: 'REJECTED', comment }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-prs'] });
      onSuccess();
    },
  });

  function submit() {
    if (!comment.trim()) { setError('Please provide a rejection reason.'); return; }
    setError('');
    mutation.mutate();
  }

  return (
    <div className="p-4 bg-red-50 border-t border-red-100">
      <p className="text-xs font-semibold text-red-700 mb-2">Rejection reason (required)</p>
      <textarea
        value={comment}
        onChange={e => { setComment(e.target.value); setError(''); }}
        rows={2}
        placeholder="Explain why this request is being rejected…"
        className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {mutation.isError && <p className="text-xs text-red-600 mt-1">Failed. Please try again.</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={submit} disabled={mutation.isPending}
          className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50">
          {mutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-red-200 text-xs text-red-700 hover:bg-red-100">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function FinancePurchaseRequestsPage() {
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [holdComment, setHoldComment] = useState('');

  const { data: prs = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['finance-prs'],
    queryFn: () => api.get<{ data: PurchaseRequest[] }>('/purchase-requests', { params: { limit: 100 } }).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/purchase-requests/${id}/approve`, { decision: 'APPROVED' }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance-prs'] }),
  });

  const holdMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.post(`/purchase-requests/${id}/approve`, { decision: 'ON_HOLD', comment }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-prs'] });
      setHoldingId(null);
      setHoldComment('');
    },
  });

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance Approvals</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Purchase requests awaiting finance sign-off
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>
      )}

      {!isLoading && prs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">No requests awaiting finance approval</p>
        </div>
      )}

      {!isLoading && prs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-xs font-semibold text-indigo-800">
              {prs.length} request{prs.length !== 1 ? 's' : ''} awaiting your sign-off
            </span>
          </div>

          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Ref', 'Item', 'Qty', 'Est. Cost', 'Budget Code', 'Raised By', 'Raised', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prs.map(pr => (
                <>
                  <tr key={pr.id}
                    className={`transition-colors ${rejectingId === pr.id ? 'bg-red-50' : holdingId === pr.id ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
                      {pr.id}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-gray-800 line-clamp-1">{pr.itemSpec}</p>
                      {pr.deviceRequest && (
                        <p className="text-xs text-blue-500">↳ {pr.deviceRequest.deviceType} for {pr.deviceRequest.requester.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-center">{pr.quantity}</td>
                    <td className="px-4 py-3 text-gray-800 font-semibold whitespace-nowrap">₹{pr.estCost}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{pr.budgetCode}</td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium text-gray-800">{pr.raisedBy.name}</p>
                      <p className="text-gray-400">{pr.raisedBy.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(pr.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveMutation.mutate(pr.id)}
                          disabled={approveMutation.isPending || rejectingId === pr.id || holdingId === pr.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setHoldingId(holdingId === pr.id ? null : pr.id)}
                          disabled={approveMutation.isPending || rejectingId === pr.id}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                            holdingId === pr.id
                              ? 'bg-orange-500 text-white hover:bg-orange-600'
                              : 'border border-orange-300 text-orange-700 hover:bg-orange-50'
                          }`}
                        >
                          Hold
                        </button>
                        <button
                          onClick={() => setRejectingId(rejectingId === pr.id ? null : pr.id)}
                          disabled={approveMutation.isPending || holdingId === pr.id}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                            rejectingId === pr.id
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'border border-red-300 text-red-700 hover:bg-red-50'
                          }`}
                        >
                          {rejectingId === pr.id ? 'Cancel' : 'Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* On-hold comment row */}
                  {holdingId === pr.id && (
                    <tr key={`hold-${pr.id}`}>
                      <td colSpan={8} className="p-0">
                        <div className="p-4 bg-orange-50 border-t border-orange-100">
                          <p className="text-xs font-semibold text-orange-700 mb-2">Hold comment (optional)</p>
                          <textarea
                            value={holdComment}
                            onChange={e => setHoldComment(e.target.value)}
                            rows={2}
                            placeholder="Reason for hold / what information is needed…"
                            className="w-full rounded-lg border border-orange-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                          />
                          {holdMutation.isError && <p className="text-xs text-red-600 mt-1">Failed. Please try again.</p>}
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => holdMutation.mutate({ id: pr.id, comment: holdComment })}
                              disabled={holdMutation.isPending}
                              className="px-4 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50"
                            >
                              {holdMutation.isPending ? 'Placing…' : 'Place on Hold'}
                            </button>
                            <button onClick={() => { setHoldingId(null); setHoldComment(''); }}
                              className="px-3 py-1.5 rounded-lg border border-orange-200 text-xs text-orange-700 hover:bg-orange-100">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {rejectingId === pr.id && (
                    <tr key={`reject-${pr.id}`}>
                      <td colSpan={8} className="p-0">
                        <RejectPanel
                          prId={pr.id}
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
