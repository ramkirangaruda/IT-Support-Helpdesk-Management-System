import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface DeviceRequest {
  id: string;
  deviceType: string;
  justification: string;
  status: string;
  comment: string | null;
  createdAt: string;
  requester: { id: string; name: string; email: string };
}

interface PurchaseRequest {
  id: string;
  itemSpec: string;
  quantity: number;
  estCost: string;
  budgetCode: string;
  status: string;
  createdAt: string;
  raisedBy: { id: string; name: string; email: string };
  deviceRequest: {
    id: string;
    deviceType: string;
    requester: { id: string; name: string; email: string };
  } | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function errMsg(err: unknown, fallback: string) {
  const raw = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(raw) ? raw.join('. ') : (raw ?? fallback);
}

// Only these statuses have a decision actually available to the caller. IT_ADMIN/SYS_ADMIN
// viewers get an unscoped PR list from the API (they need it for other pages), so this page
// filters it back down — a RAISED draft, for example, isn't decidable yet (it needs to be
// reviewed and submitted on the Procurement Pipeline page first) and showing Approve/Hold/Reject
// buttons for it would just 400 silently when clicked.
const ACTIONABLE_PR_STATUSES = new Set(['PENDING_MANAGER_APPROVAL', 'PENDING_FINANCE_APPROVAL', 'ON_HOLD']);

// ── Comment panel (shared for reject / on-hold) ───────────────────────────────

function ActionPanel({
  decision,
  onConfirm,
  onCancel,
  isPending,
  isError,
}: {
  decision:  'REJECTED' | 'ON_HOLD';
  onConfirm: (comment: string) => void;
  onCancel:  () => void;
  isPending: boolean;
  isError:   boolean;
}) {
  const [comment, setComment] = useState('');
  const [error,   setError]   = useState('');
  const isRed = decision === 'REJECTED';

  function submit() {
    if (isRed && !comment.trim()) { setError('A reason is required.'); return; }
    setError('');
    onConfirm(comment);
  }

  return (
    <div className={`p-4 border-t ${isRed ? 'bg-[#fff7f7] border-[#fecdd3]' : 'bg-[#fef9f0] border-[#f0d870]'}`}>
      <p className={`text-xs font-semibold mb-2 ${isRed ? 'text-[#c0392b]' : 'text-[#b07800]'}`}>
        {isRed ? 'Rejection reason (required)' : 'Hold comment (optional)'}
      </p>
      <textarea
        value={comment}
        onChange={e => { setComment(e.target.value); setError(''); }}
        rows={2}
        placeholder={isRed ? 'Explain why this request is being rejected…' : 'What information is needed?…'}
        className={`w-full rounded-lg border px-3 py-2 text-sm resize-none
                    focus:outline-none focus:border-2
                    ${isRed
                      ? 'border-[#fecdd3] focus:border-[#c0392b]'
                      : 'border-[#f0d870] focus:border-[#b07800]'}`}
      />
      {error   && <p className="text-xs text-[#c0392b] mt-1">{error}</p>}
      {isError && <p className="text-xs text-[#c0392b] mt-1">Failed. Please try again.</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={submit}
          disabled={isPending}
          className={`px-4 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50
            ${isRed ? 'bg-[#c0392b] hover:bg-[#a83228]' : 'bg-[#b07800] hover:bg-[#8a5b00]'}`}
        >
          {isPending ? 'Processing…' : isRed ? 'Confirm Reject' : 'Place on Hold'}
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

// ── Device Requests Tab ───────────────────────────────────────────────────────

function DeviceRequestsTab() {
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery<DeviceRequest[]>({
    queryKey: ['pending-device-approvals'],
    queryFn: () =>
      api.get<{ data: DeviceRequest[] }>('/device-requests', {
        params: { status: 'PENDING_MANAGER_APPROVAL', limit: 100 },
      }).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/device-requests/${id}/decision`, { decision: 'APPROVED' }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-device-approvals'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.post(`/device-requests/${id}/decision`, { decision: 'REJECTED', comment }).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-device-approvals'] });
      setRejectingId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-hair overflow-hidden animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-4 border-b border-[#f2f2f7] last:border-0">
            <div className="h-4 w-28 bg-[#f2f2f7] rounded" />
            <div className="h-4 w-16 bg-[#f2f2f7] rounded" />
            <div className="h-4 flex-1 bg-[#f2f2f7] rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-3">
        <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-medium">No pending device approvals</p>
        <p className="text-xs">All device requests have been reviewed</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-hair overflow-hidden">
      <div className="px-4 py-3 bg-[#fef9ec] border-b border-[#f0d870] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#b07800]" />
        <span className="text-xs font-semibold text-[#b07800]">
          {requests.length} request{requests.length !== 1 ? 's' : ''} awaiting your approval
        </span>
      </div>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-hair">
            {['Requester', 'Device Type', 'Justification', 'Raised', 'Actions'].map(h => (
              <th key={h}
                className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                           uppercase tracking-[0.06em] whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f2f2f7]">
          {requests.map(req => (
            <>
              <tr key={req.id}
                className={rejectingId === req.id ? 'bg-[#fff7f7]' : 'hover:bg-[#fafafa]'}>
                <td className="px-4 py-3.5">
                  <p className="font-semibold text-ink">{req.requester.name}</p>
                  <p className="text-xs text-ink-muted">{req.requester.email}</p>
                </td>
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                   bg-[#e0f0fe] text-indigo-600 border border-[#b6d8ff]">
                    {req.deviceType}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-ink-muted text-xs max-w-sm">
                  <span className="line-clamp-3">{req.justification}</span>
                </td>
                <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                  {formatDate(req.createdAt)}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveMutation.mutate(req.id)}
                      disabled={approveMutation.isPending || rejectingId === req.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a7f4b] text-white
                                 hover:bg-[#166940] disabled:opacity-40"
                    >
                      {approveMutation.isPending ? '…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => setRejectingId(rejectingId === req.id ? null : req.id)}
                      disabled={approveMutation.isPending}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 ${
                        rejectingId === req.id
                          ? 'bg-[#c0392b] text-white hover:bg-[#a83228]'
                          : 'border border-[#fecdd3] text-[#c0392b] hover:bg-[#fff1f2]'
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
                    <ActionPanel
                      decision="REJECTED"
                      onConfirm={comment => rejectMutation.mutate({ id: req.id, comment })}
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
  );
}

// ── Purchase Requests Tab ─────────────────────────────────────────────────────

function PurchaseRequestsTab() {
  const queryClient = useQueryClient();
  const [actionState, setActionState] = useState<{ id: string; type: 'REJECTED' | 'ON_HOLD' } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data: rawPrs = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['pending-pr-approvals'],
    queryFn: () =>
      api.get<{ data: PurchaseRequest[] }>('/purchase-requests', { params: { limit: 100 } })
        .then(r => r.data.data),
    refetchInterval: 30_000,
  });
  // IT_ADMIN/SYS_ADMIN viewers get every PR back unscoped — only show ones actually decidable here.
  const prs = rawPrs.filter(pr => ACTIONABLE_PR_STATUSES.has(pr.status));

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 4000);
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/purchase-requests/${id}/approve`, { decision: 'APPROVED' }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-pr-approvals'] }),
    onError: (err) => flash(errMsg(err, 'Could not approve this request')),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: 'REJECTED' | 'ON_HOLD'; comment: string }) =>
      api.post(`/purchase-requests/${id}/approve`, { decision, comment: comment || undefined }).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-pr-approvals'] });
      setActionState(null);
    },
    onError: (err) => flash(errMsg(err, 'Could not process this request')),
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-hair overflow-hidden animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-4 border-b border-[#f2f2f7] last:border-0">
            <div className="h-4 w-20 bg-[#f2f2f7] rounded" />
            <div className="h-4 flex-1 bg-[#f2f2f7] rounded" />
            <div className="h-4 w-16 bg-[#f2f2f7] rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (prs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-3">
        <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-medium">No purchase requests pending approval</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-hair overflow-hidden">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium bg-[#c0392b] text-white shadow-lg max-w-sm">
          {toast}
        </div>
      )}
      <div className="px-4 py-3 bg-[#fef9ec] border-b border-[#f0d870] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#b07800]" />
        <span className="text-xs font-semibold text-[#b07800]">
          {prs.length} purchase request{prs.length !== 1 ? 's' : ''} pending your approval
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-hair">
              {['PR ID', 'Item', 'Qty', 'Est. Cost', 'Budget Code', 'Raised By', 'Linked Request', 'Raised', 'Actions'].map(h => (
                <th key={h}
                  className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                             uppercase tracking-[0.06em] whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f2f2f7]">
            {prs.map(pr => {
              const isActingOn  = actionState?.id === pr.id;
              const isHolding   = isActingOn && actionState?.type === 'ON_HOLD';
              const isRejecting = isActingOn && actionState?.type === 'REJECTED';
              return (
                <>
                  <tr
                    key={pr.id}
                    className={
                      isRejecting ? 'bg-[#fff7f7]' :
                      isHolding   ? 'bg-[#fef9f0]' :
                                    'hover:bg-[#fafafa]'
                    }
                  >
                    <td className="px-4 py-3.5 font-mono text-xs text-indigo-600 font-medium whitespace-nowrap">
                      {pr.id}
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <p className="font-medium text-ink line-clamp-2">{pr.itemSpec}</p>
                    </td>
                    <td className="px-4 py-3.5 text-ink-soft text-center tabular-nums">{pr.quantity}</td>
                    <td className="px-4 py-3.5 font-semibold text-ink whitespace-nowrap">₹{pr.estCost}</td>
                    <td className="px-4 py-3.5 text-ink-muted text-xs font-mono">{pr.budgetCode}</td>
                    <td className="px-4 py-3.5 text-xs">
                      <p className="font-medium text-ink">{pr.raisedBy.name}</p>
                      <p className="text-ink-muted">{pr.raisedBy.email}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-ink-muted">
                      {pr.deviceRequest
                        ? <span className="text-indigo-600">{pr.deviceRequest.deviceType} for {pr.deviceRequest.requester.name}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                      {formatDate(pr.createdAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveMutation.mutate(pr.id)}
                          disabled={approveMutation.isPending || isActingOn}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a7f4b] text-white
                                     hover:bg-[#166940] disabled:opacity-40"
                        >
                          {approveMutation.isPending ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setActionState(isHolding ? null : { id: pr.id, type: 'ON_HOLD' })}
                          disabled={approveMutation.isPending || isRejecting}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 ${
                            isHolding
                              ? 'bg-[#b07800] text-white hover:bg-[#8a5b00]'
                              : 'border border-[#f0d870] text-[#b07800] hover:bg-[#fef9ec]'
                          }`}
                        >
                          {isHolding ? 'Cancel' : 'Hold'}
                        </button>
                        <button
                          onClick={() => setActionState(isRejecting ? null : { id: pr.id, type: 'REJECTED' })}
                          disabled={approveMutation.isPending || isHolding}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 ${
                            isRejecting
                              ? 'bg-[#c0392b] text-white hover:bg-[#a83228]'
                              : 'border border-[#fecdd3] text-[#c0392b] hover:bg-[#fff1f2]'
                          }`}
                        >
                          {isRejecting ? 'Cancel' : 'Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isActingOn && (
                    <tr key={`action-${pr.id}`}>
                      <td colSpan={9} className="p-0">
                        <ActionPanel
                          decision={actionState.type}
                          onConfirm={comment => actionMutation.mutate({ id: pr.id, decision: actionState.type, comment })}
                          onCancel={() => setActionState(null)}
                          isPending={actionMutation.isPending}
                          isError={actionMutation.isError}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ActiveTab = 'devices' | 'purchase-requests';

export default function ManagerApprovalsPage() {
  const [tab, setTab] = useState<ActiveTab>('devices');

  const { data: deviceRequests = [] } = useQuery<DeviceRequest[]>({
    queryKey: ['pending-device-approvals'],
    queryFn: () =>
      api.get<{ data: DeviceRequest[] }>('/device-requests', {
        params: { status: 'PENDING_MANAGER_APPROVAL', limit: 100 },
      }).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: rawPrs = [] } = useQuery<PurchaseRequest[]>({
    queryKey: ['pending-pr-approvals'],
    queryFn: () =>
      api.get<{ data: PurchaseRequest[] }>('/purchase-requests', { params: { limit: 100 } })
        .then(r => r.data.data),
    refetchInterval: 30_000,
  });
  const prs = rawPrs.filter(pr => ACTIONABLE_PR_STATUSES.has(pr.status));

  const totalPending = deviceRequests.length + prs.length;

  const tabDefs: { key: ActiveTab; label: string; count: number }[] = [
    { key: 'devices',           label: 'Device Requests',   count: deviceRequests.length },
    { key: 'purchase-requests', label: 'Purchase Requests', count: prs.length },
  ];

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">
          Approvals
          {totalPending > 0 && (
            <span className="ml-3 px-2.5 py-0.5 rounded-full text-xs font-medium
                             bg-[#fef9ec] text-[#b07800] border border-[#f0d870]">
              {totalPending} pending
            </span>
          )}
        </h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Review and approve or reject requests from your team
        </p>
      </div>

      <div className="flex gap-0 mb-6 border-b border-hair">
        {tabDefs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors
              ${tab === t.key
                ? 'border-b-2 border-indigo-600 text-indigo-600 -mb-px'
                : 'text-ink-muted hover:text-ink'}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold
                               bg-[#fef9ec] text-[#b07800]">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'devices'           && <DeviceRequestsTab />}
      {tab === 'purchase-requests' && <PurchaseRequestsTab />}
    </Layout>
  );
}
