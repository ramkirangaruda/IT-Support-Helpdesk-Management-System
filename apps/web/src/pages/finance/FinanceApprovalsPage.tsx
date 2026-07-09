import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { purchaseRequestActionConfirmation } from '../../lib/requestFlow';

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
  title, isRed, required, actionLabel, onConfirm, onCancel, isPending, isError,
}: {
  title:       string;
  isRed:       boolean;
  required:    boolean;
  actionLabel: string;
  onConfirm:   (comment: string) => void;
  onCancel:    () => void;
  isPending:   boolean;
  isError:     boolean;
}) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  function submit() {
    if (required && !comment.trim()) { setError('A reason is required.'); return; }
    setError('');
    onConfirm(comment);
  }

  return (
    <div className={`p-4 border-t ${isRed ? 'bg-[#fff7f7] border-[#fecdd3]' : 'bg-[#fef9f0] border-[#f0d870]'}`}>
      <p className={`text-xs font-semibold mb-2 ${isRed ? 'text-[#c0392b]' : 'text-[#b07800]'}`}>
        {title} {required ? '(required)' : '(optional)'}
      </p>
      <textarea
        value={comment}
        onChange={e => { setComment(e.target.value); setError(''); }}
        rows={2}
        placeholder={required ? 'Provide a reason…' : 'Add a comment (optional)…'}
        className={`w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:border-2
                    ${isRed ? 'border-[#fecdd3] focus:border-[#c0392b]' : 'border-[#f0d870] focus:border-[#b07800]'}`}
      />
      {error   && <p className="text-xs text-[#c0392b] mt-1">{error}</p>}
      {isError && <p className="text-xs text-[#c0392b] mt-1">Action failed. Please try again.</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={submit}
          disabled={isPending}
          className={`px-4 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50
            ${isRed ? 'bg-[#c0392b] hover:bg-[#a83228]' : 'bg-[#b07800] hover:bg-[#8a5b00]'}`}
        >
          {isPending ? 'Processing…' : actionLabel}
        </button>
        <button
          onClick={onCancel}
          className={`px-3 py-1.5 rounded-lg border text-xs
            ${isRed
              ? 'border-[#fecdd3] text-[#c0392b] hover:bg-[#fff1f2]'
              : 'border-[#f0d870] text-[#b07800] hover:bg-[#fef9ec]'}`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-hair overflow-hidden animate-pulse">
      <div className="border-b border-hair h-10" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3.5 border-b border-[#f2f2f7] last:border-0">
          <div className="h-4 w-20 bg-[#f2f2f7] rounded" />
          <div className="h-4 flex-1 bg-[#f2f2f7] rounded" />
          <div className="h-4 w-16 bg-[#f2f2f7] rounded" />
        </div>
      ))}
    </div>
  );
}

export default function FinanceApprovalsPage() {
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [holdingId,   setHoldingId]   = useState<string | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 6000);
  }

  const { data: prs = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['finance-approvals'],
    queryFn: () =>
      api.get<{ data: PurchaseRequest[] }>('/purchase-requests', { params: { limit: 100 } })
        .then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/purchase-requests/${id}/approve`, { decision: 'APPROVED' }).then(r => r.data),
    onSuccess: (data: { status: string }) => {
      queryClient.invalidateQueries({ queryKey: ['finance-approvals'] });
      flash(purchaseRequestActionConfirmation('APPROVED', data.status));
    },
  });

  const holdMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.post(`/purchase-requests/${id}/approve`, { decision: 'ON_HOLD', comment }).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance-approvals'] });
      setHoldingId(null);
      flash(purchaseRequestActionConfirmation('ON_HOLD', 'ON_HOLD'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.post(`/purchase-requests/${id}/approve`, { decision: 'REJECTED', comment }).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance-approvals'] });
      setRejectingId(null);
      flash(purchaseRequestActionConfirmation('REJECTED', 'REJECTED'));
    },
  });

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">Finance Approvals</h1>
        <p className="text-sm text-ink-muted mt-0.5">Purchase requests awaiting finance sign-off</p>
      </div>

      {isLoading && <TableSkeleton />}

      {!isLoading && prs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-3
                        bg-white rounded-xl border border-hair">
          <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">No requests awaiting finance approval</p>
        </div>
      )}

      {!isLoading && prs.length > 0 && (
        <div className="bg-white rounded-xl border border-hair overflow-hidden">
          <div className="px-4 py-3 bg-[#e0f0fe] border-b border-[#b6d8ff] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600" />
            <span className="text-xs font-semibold text-indigo-700">
              {prs.length} request{prs.length !== 1 ? 's' : ''} awaiting finance sign-off
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-hair">
                  {['Ref', 'Item Specification', 'Qty', 'Est. Cost', 'Budget Code', 'Vendor', 'Raised By', 'Date', 'Actions'].map(h => (
                    <th key={h}
                      className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                                 uppercase tracking-[0.06em] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f2f7]">
                {prs.map(pr => (
                  <>
                    <tr
                      key={pr.id}
                      className={
                        rejectingId === pr.id ? 'bg-[#fff7f7]' :
                        holdingId   === pr.id ? 'bg-[#fef9f0]' :
                                                'hover:bg-[#fafafa]'
                      }
                    >
                      <td className="px-4 py-3.5 font-mono text-xs text-indigo-600 font-medium whitespace-nowrap">
                        {pr.id}
                      </td>
                      <td className="px-4 py-3.5 max-w-xs">
                        <p className="font-medium text-ink line-clamp-2">{pr.itemSpec}</p>
                        {pr.deviceRequest && (
                          <p className="text-xs text-indigo-600 mt-0.5">
                            ↳ {pr.deviceRequest.deviceType} for {pr.deviceRequest.requester.name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-ink-soft text-center tabular-nums">{pr.quantity}</td>
                      <td className="px-4 py-3.5 font-semibold text-ink whitespace-nowrap">₹{pr.estCost}</td>
                      <td className="px-4 py-3.5 text-ink-muted text-xs font-mono">{pr.budgetCode}</td>
                      <td className="px-4 py-3.5 text-xs">
                        {pr.vendor ? (
                          <div>
                            <p className="font-medium text-ink-soft">{pr.vendor.name}</p>
                            <p className="text-ink-muted">{pr.vendor.category}
                              {pr.vendor.leadTimeDays != null && ` · ${pr.vendor.leadTimeDays}d`}
                            </p>
                          </div>
                        ) : (
                          <span className="text-ink-muted italic text-xs">Not selected</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        <p className="font-medium text-ink">{pr.raisedBy.name}</p>
                        <p className="text-ink-muted">{pr.raisedBy.email}</p>
                      </td>
                      <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                        {formatDate(pr.createdAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveMutation.mutate(pr.id)}
                            disabled={approveMutation.isPending || rejectingId === pr.id || holdingId === pr.id}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a7f4b] text-white
                                       hover:bg-[#166940] disabled:opacity-40 whitespace-nowrap"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setHoldingId(holdingId === pr.id ? null : pr.id);
                              setRejectingId(null);
                            }}
                            disabled={approveMutation.isPending || rejectingId === pr.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 whitespace-nowrap ${
                              holdingId === pr.id
                                ? 'bg-[#b07800] text-white hover:bg-[#8a5b00]'
                                : 'border border-[#f0d870] text-[#b07800] hover:bg-[#fef9ec]'
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
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 whitespace-nowrap ${
                              rejectingId === pr.id
                                ? 'bg-[#c0392b] text-white hover:bg-[#a83228]'
                                : 'border border-[#fecdd3] text-[#c0392b] hover:bg-[#fff1f2]'
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
                            isRed={false}
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
                            isRed={true}
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

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium bg-[#1a7f4b] text-white shadow-lg max-w-sm">
          {toast}
        </div>
      )}
    </Layout>
  );
}
