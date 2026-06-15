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
  vendor: { id: string; name: string; category: string; leadTimeDays: number | null } | null;
  deviceRequest: {
    id: string;
    deviceType: string;
    requester: { id: string; name: string; email: string };
  } | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CommentPanel({
  title,
  color,
  required,
  actionLabel,
  onConfirm,
  onCancel,
  isPending,
  isError,
}: {
  title: string;
  color: 'red' | 'orange';
  required: boolean;
  actionLabel: string;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
  isPending: boolean;
  isError: boolean;
}) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const isRed = color === 'red';
  const bg        = isRed ? 'bg-red-50'      : 'bg-orange-50';
  const border    = isRed ? 'border-red-100'  : 'border-orange-100';
  const titleCls  = isRed ? 'text-red-700'   : 'text-orange-700';
  const ringCls   = isRed ? 'border-red-200 focus:ring-red-400'   : 'border-orange-200 focus:ring-orange-400';
  const btnCls    = isRed ? 'bg-red-600 hover:bg-red-700'         : 'bg-orange-500 hover:bg-orange-600';
  const cancelCls = isRed ? 'border-red-200 text-red-700 hover:bg-red-100' : 'border-orange-200 text-orange-700 hover:bg-orange-100';

  function submit() {
    if (required && !comment.trim()) { setError('A reason is required.'); return; }
    setError('');
    onConfirm(comment);
  }

  return (
    <div className={`p-4 ${bg} border-t ${border}`}>
      <p className={`text-xs font-semibold ${titleCls} mb-2`}>
        {title} {required ? '(required)' : '(optional)'}
      </p>
      <textarea
        value={comment}
        onChange={e => { setComment(e.target.value); setError(''); }}
        rows={2}
        placeholder={required ? 'Provide a reason…' : 'Add a comment (optional)…'}
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${ringCls}`}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {isError && <p className="text-xs text-red-600 mt-1">Action failed. Please try again.</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={submit} disabled={isPending}
          className={`px-4 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50 ${btnCls}`}>
          {isPending ? 'Processing…' : actionLabel}
        </button>
        <button onClick={onCancel}
          className={`px-3 py-1.5 rounded-lg border text-xs ${cancelCls}`}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function FinanceApprovalsPage() {
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [holdingId,   setHoldingId]   = useState<string | null>(null);

  const { data: prs = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['finance-approvals'],
    queryFn: () => api.get<PurchaseRequest[]>('/purchase-requests').then(r => r.data),
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/purchase-requests/${id}/approve`, { decision: 'APPROVED' }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['finance-approvals'] }),
  });

  const holdMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.post(`/purchase-requests/${id}/approve`, { decision: 'ON_HOLD', comment }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-approvals'] });
      setHoldingId(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.post(`/purchase-requests/${id}/approve`, { decision: 'REJECTED', comment }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-approvals'] });
      setRejectingId(null);
    },
  });

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance Approvals</h1>
        <p className="text-sm text-gray-500 mt-0.5">Purchase requests awaiting finance sign-off</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>
      )}

      {!isLoading && prs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border border-gray-200">
          <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">No requests awaiting finance approval</p>
        </div>
      )}

      {!isLoading && prs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-semibold text-blue-800">
              {prs.length} request{prs.length !== 1 ? 's' : ''} awaiting finance sign-off
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Ref', 'Item Specification', 'Qty', 'Est. Cost', 'Budget Code', 'Vendor', 'Raised By', 'Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {prs.map(pr => (
                  <>
                    <tr
                      key={pr.id}
                      className={`transition-colors ${
                        rejectingId === pr.id ? 'bg-red-50' : holdingId === pr.id ? 'bg-orange-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
                        {pr.id}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-medium text-gray-800 line-clamp-2">{pr.itemSpec}</p>
                        {pr.deviceRequest && (
                          <p className="text-xs text-blue-500 mt-0.5">
                            ↳ {pr.deviceRequest.deviceType} for {pr.deviceRequest.requester.name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-center tabular-nums">{pr.quantity}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">£{pr.estCost}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{pr.budgetCode}</td>
                      <td className="px-4 py-3 text-xs">
                        {pr.vendor ? (
                          <div>
                            <p className="font-medium text-gray-700">{pr.vendor.name}</p>
                            <p className="text-gray-400">{pr.vendor.category}
                              {pr.vendor.leadTimeDays != null && ` · ${pr.vendor.leadTimeDays}d`}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-300 italic text-xs">Not selected</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p className="font-medium text-gray-800">{pr.raisedBy.name}</p>
                        <p className="text-gray-400">{pr.raisedBy.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {formatDate(pr.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveMutation.mutate(pr.id)}
                            disabled={approveMutation.isPending || rejectingId === pr.id || holdingId === pr.id}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setHoldingId(holdingId === pr.id ? null : pr.id);
                              setRejectingId(null);
                            }}
                            disabled={approveMutation.isPending || rejectingId === pr.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 whitespace-nowrap ${
                              holdingId === pr.id
                                ? 'bg-orange-500 text-white hover:bg-orange-600'
                                : 'border border-orange-300 text-orange-700 hover:bg-orange-50'
                            }`}
                          >
                            {holdingId === pr.id ? 'Cancel' : 'Hold'}
                          </button>
                          <button
                            onClick={() => {
                              setRejectingId(rejectingId === pr.id ? null : pr.id);
                              setHoldingId(null);
                            }}
                            disabled={approveMutation.isPending || holdingId === pr.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 whitespace-nowrap ${
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

                    {holdingId === pr.id && (
                      <tr key={`hold-${pr.id}`}>
                        <td colSpan={9} className="p-0">
                          <CommentPanel
                            title="Hold comment"
                            color="orange"
                            required={false}
                            actionLabel="Place on Hold"
                            onConfirm={comment => holdMutation.mutate({ id: pr.id, comment })}
                            onCancel={() => setHoldingId(null)}
                            isPending={holdMutation.isPending}
                            isError={holdMutation.isError}
                          />
                        </td>
                      </tr>
                    )}

                    {rejectingId === pr.id && (
                      <tr key={`reject-${pr.id}`}>
                        <td colSpan={9} className="p-0">
                          <CommentPanel
                            title="Rejection reason"
                            color="red"
                            required={true}
                            actionLabel="Confirm Reject"
                            onConfirm={comment => rejectMutation.mutate({ id: pr.id, comment })}
                            onCancel={() => setRejectingId(null)}
                            isPending={rejectMutation.isPending}
                            isError={rejectMutation.isError}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
