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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Inline Action Panel (shared) ──────────────────────────────────────────────

function ActionPanel({
  decision,
  onConfirm,
  onCancel,
  isPending,
  isError,
}: {
  decision: 'REJECTED' | 'ON_HOLD';
  onConfirm: (comment: string) => void;
  onCancel: () => void;
  isPending: boolean;
  isError: boolean;
}) {
  const [comment, setComment] = useState('');
  const [error,   setError]   = useState('');
  const isRed     = decision === 'REJECTED';
  const required  = isRed;

  const bgCls     = isRed ? 'bg-red-50 border-red-100'     : 'bg-orange-50 border-orange-100';
  const titleCls  = isRed ? 'text-red-700'                 : 'text-orange-700';
  const ringCls   = isRed ? 'border-red-200 focus:ring-red-400' : 'border-orange-200 focus:ring-orange-400';
  const btnCls    = isRed ? 'bg-red-600 hover:bg-red-700'  : 'bg-orange-500 hover:bg-orange-600';
  const canCls    = isRed ? 'border-red-200 text-red-700 hover:bg-red-100' : 'border-orange-200 text-orange-700 hover:bg-orange-100';

  function submit() {
    if (required && !comment.trim()) { setError('A reason is required.'); return; }
    setError('');
    onConfirm(comment);
  }

  return (
    <div className={`p-4 border-t ${bgCls}`}>
      <p className={`text-xs font-semibold mb-2 ${titleCls}`}>
        {isRed ? 'Rejection reason (required)' : 'Hold comment (optional)'}
      </p>
      <textarea
        value={comment}
        onChange={e => { setComment(e.target.value); setError(''); }}
        rows={2}
        placeholder={isRed ? 'Explain why this request is being rejected…' : 'What information is needed?…'}
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${ringCls}`}
      />
      {error   && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {isError && <p className="text-xs text-red-600 mt-1">Failed. Please try again.</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={submit} disabled={isPending}
          className={`px-4 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50 ${btnCls}`}>
          {isPending ? 'Processing…' : isRed ? 'Confirm Reject' : 'Place on Hold'}
        </button>
        <button onClick={onCancel}
          className={`px-3 py-1.5 rounded-lg border text-xs ${canCls}`}>
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
      api.get<{ data: DeviceRequest[] }>('/device-requests', { params: { status: 'PENDING_MANAGER_APPROVAL', limit: 100 } })
        .then(r => r.data.data),
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
      queryClient.invalidateQueries({ queryKey: ['pending-device-approvals'] });
      setRejectingId(null);
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>;
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-medium">No pending device approvals</p>
        <p className="text-xs text-gray-400 mt-1">All device requests have been reviewed</p>
      </div>
    );
  }

  return (
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
              <tr key={req.id}
                className={`transition-colors ${rejectingId === req.id ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-800">{req.requester.name}</p>
                  <p className="text-xs text-gray-400">{req.requester.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
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
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40"
                    >
                      {approveMutation.isPending ? '…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => setRejectingId(rejectingId === req.id ? null : req.id)}
                      disabled={approveMutation.isPending}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
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

  const { data: prs = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['pending-pr-approvals'],
    queryFn: () => api.get<{ data: PurchaseRequest[] }>('/purchase-requests', { params: { limit: 100 } }).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/purchase-requests/${id}/approve`, { decision: 'APPROVED' }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-pr-approvals'] }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: 'REJECTED' | 'ON_HOLD'; comment: string }) =>
      api.post(`/purchase-requests/${id}/approve`, { decision, comment: comment || undefined }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-pr-approvals'] });
      setActionState(null);
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>;
  }

  if (prs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-medium">No purchase requests pending approval</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-xs font-semibold text-yellow-800">
          {prs.length} purchase request{prs.length !== 1 ? 's' : ''} pending your approval
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['PR ID', 'Item', 'Qty', 'Est. Cost', 'Budget Code', 'Raised By', 'Linked Request', 'Raised', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {prs.map(pr => {
              const isActingOn  = actionState?.id === pr.id;
              const isHolding   = isActingOn && actionState?.type === 'ON_HOLD';
              const isRejecting = isActingOn && actionState?.type === 'REJECTED';
              return (
                <>
                  <tr
                    key={pr.id}
                    className={`transition-colors ${isRejecting ? 'bg-red-50' : isHolding ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
                      {pr.id}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-gray-800 line-clamp-2">{pr.itemSpec}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-center tabular-nums">{pr.quantity}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">£{pr.estCost}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{pr.budgetCode}</td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium text-gray-800">{pr.raisedBy.name}</p>
                      <p className="text-gray-400">{pr.raisedBy.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {pr.deviceRequest ? (
                        <span className="text-blue-600">
                          {pr.deviceRequest.deviceType} for {pr.deviceRequest.requester.name}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(pr.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveMutation.mutate(pr.id)}
                          disabled={approveMutation.isPending || isActingOn}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
                        >
                          {approveMutation.isPending ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setActionState(isHolding ? null : { id: pr.id, type: 'ON_HOLD' })}
                          disabled={approveMutation.isPending || isRejecting}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                            isHolding
                              ? 'bg-orange-500 text-white hover:bg-orange-600'
                              : 'border border-orange-300 text-orange-700 hover:bg-orange-50'
                          }`}
                        >
                          {isHolding ? 'Cancel' : 'Hold'}
                        </button>
                        <button
                          onClick={() => setActionState(isRejecting ? null : { id: pr.id, type: 'REJECTED' })}
                          disabled={approveMutation.isPending || isHolding}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                            isRejecting
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'border border-red-300 text-red-700 hover:bg-red-50'
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
      api.get<{ data: DeviceRequest[] }>('/device-requests', { params: { status: 'PENDING_MANAGER_APPROVAL', limit: 100 } })
        .then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: prs = [] } = useQuery<PurchaseRequest[]>({
    queryKey: ['pending-pr-approvals'],
    queryFn: () => api.get<{ data: PurchaseRequest[] }>('/purchase-requests', { params: { limit: 100 } }).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const totalPending = deviceRequests.length + prs.length;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Review and approve or reject requests from your team
          {totalPending > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold">
              {totalPending} pending
            </span>
          )}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {(
          [
            { key: 'devices',           label: 'Device Requests',   count: deviceRequests.length },
            { key: 'purchase-requests', label: 'Purchase Requests', count: prs.length },
          ] as { key: ActiveTab; label: string; count: number }[]
        ).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors
              ${tab === t.key
                ? 'text-indigo-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">
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
