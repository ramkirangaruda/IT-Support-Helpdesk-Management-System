import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';
import { deviceRequestNextStepForViewer } from '../../lib/requestFlow';

interface DeviceRequest {
  id: string;
  deviceType: string;
  justification: string;
  status: string;
  comment: string | null;
  createdAt: string;
  requester: { id: string; name: string; email: string };
  manager: { id: string; name: string; email: string } | null;
  allocation: {
    device: { id: string; type: string; makeModel: string | null };
    allocatedAt: string;
    returnedOn: string | null;
  } | null;
}

interface AvailableDevice {
  id: string;
  type: string;
  makeModel: string | null;
  serialNumber: string;
  condition: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  SUBMITTED:                'bg-[#e0f0fe] text-[#0071e3] border-[#b6d8ff]',
  PENDING_MANAGER_APPROVAL: 'bg-[#fef9ec] text-[#b07800] border-[#f0d870]',
  APPROVED:                 'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]',
  REJECTED:                 'bg-[#fff1f2] text-[#c0392b] border-[#fecdd3]',
  PENDING_FULFILMENT:       'bg-[#eef0fb] text-[#3b5cc3] border-[#c7cef8]',
  ALLOCATED:                'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]',
  RETURN_REQUESTED:         'bg-[#fff2ea] text-[#b45309] border-[#f7c69a]',
  RETURNED:                 'bg-[#f2f2f7] text-[#6e6e73] border-hair',
  CANCELLED:                'bg-[#f2f2f7] text-[#6e6e73] border-hair',
};

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED:                'Submitted',
  PENDING_MANAGER_APPROVAL: 'Pending Approval',
  APPROVED:                 'Approved',
  REJECTED:                 'Rejected',
  PENDING_FULFILMENT:       'Pending Fulfilment',
  ALLOCATED:                'Allocated',
  RETURN_REQUESTED:         'Return Requested',
  RETURNED:                 'Returned',
  CANCELLED:                'Cancelled',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function TableRowSkeleton() {
  return (
    <tr className="border-b border-[#f2f2f7] animate-pulse">
      {[20, 24, 12, 32, 16, 12, 14].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className={`h-4 bg-[#f2f2f7] rounded w-${w}`} />
        </td>
      ))}
    </tr>
  );
}

// ── Allocate Device Modal ─────────────────────────────────────────────────────

function AllocateModal({ request, onClose, onAllocated }: {
  request: DeviceRequest;
  onClose: () => void;
  onAllocated: (deviceId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [deviceId, setDeviceId] = useState('');
  const [conditionAtIssue, setConditionAtIssue] = useState('Good');

  const { data: available = [], isLoading } = useQuery<AvailableDevice[]>({
    queryKey: ['devices-available', request.deviceType],
    queryFn: () =>
      api.get<{ data: AvailableDevice[] }>('/devices', {
        params: { status: 'AVAILABLE', type: request.deviceType, limit: 100 },
      }).then(r => r.data.data),
  });

  const allocateMutation = useMutation({
    mutationFn: () =>
      api.post(`/device-requests/${request.id}/allocate`, { deviceId, conditionAtIssue }).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['device-requests'] });
      onAllocated(deviceId);
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-hair w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hair">
          <h2 className="text-base font-semibold text-ink">Allocate Device</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">×</button>
        </div>

        <div className="px-6 pt-4">
          <div className="rounded-lg bg-[#fafafa] border border-hair px-4 py-3 text-sm mb-4">
            <p className="font-semibold text-ink">{request.requester.name}</p>
            <p className="text-ink-muted text-xs">{request.requester.email}</p>
            <p className="text-ink-muted text-xs mt-1">
              Requested: <span className="font-medium text-ink-soft">{request.deviceType}</span>
            </p>
          </div>

          <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-2">
            Select Available {request.deviceType}
          </label>

          {isLoading && (
            <div className="py-4 animate-pulse">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-14 bg-[#f2f2f7] rounded-lg mb-2" />
              ))}
            </div>
          )}

          {!isLoading && available.length === 0 && (
            <div className="rounded-lg bg-[#fef9ec] border border-[#f0d870] px-4 py-3 text-sm text-[#b07800] mb-4">
              No available {request.deviceType} devices in stock.
            </div>
          )}

          {available.length > 0 && (
            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {available.map(d => (
                <label
                  key={d.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer ${
                    deviceId === d.id
                      ? 'border-indigo-600 bg-[#e0f0fe]'
                      : 'border-hair hover:bg-[#fafafa]'
                  }`}
                >
                  <input
                    type="radio"
                    name="device"
                    value={d.id}
                    checked={deviceId === d.id}
                    onChange={() => setDeviceId(d.id)}
                    className="text-indigo-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-ink font-mono">{d.id}</p>
                    <p className="text-xs text-ink-muted">
                      {d.makeModel ?? 'No model'} · SN: {d.serialNumber}
                      {d.condition ? ` · ${d.condition}` : ''}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {available.length > 0 && (
            <div className="mb-4">
              <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
                Condition at Issue
              </label>
              <select
                value={conditionAtIssue}
                onChange={e => setConditionAtIssue(e.target.value)}
                className="w-full rounded-lg border border-hair px-3 py-2 text-sm bg-white text-ink
                           focus:outline-none focus:border-2 focus:border-indigo-600"
              >
                <option value="New">New</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Refurbished">Refurbished</option>
              </select>
            </div>
          )}

          {allocateMutation.isError && (
            <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-3 py-2 mb-3">
              <p className="text-xs text-[#c0392b]">Allocation failed. Please try again.</p>
            </div>
          )}

          <div className="flex gap-3 pb-6">
            <button
              onClick={() => allocateMutation.mutate()}
              disabled={!deviceId || !conditionAtIssue || allocateMutation.isPending || available.length === 0}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 disabled:opacity-50"
            >
              {allocateMutation.isPending ? 'Allocating…' : 'Allocate'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'pending' | 'all';
const ALL_STATUSES = Object.keys(STATUS_LABEL);

export default function DeviceRequestQueuePage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [filterStatus, setFilterStatus] = useState('');
  const [allocatingRequest, setAllocatingRequest] = useState<DeviceRequest | null>(null);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 5000);
  }

  const { data: requests = [], isLoading } = useQuery<DeviceRequest[]>({
    queryKey: ['device-requests'],
    queryFn: () =>
      api.get<{ data: DeviceRequest[] }>('/device-requests', { params: { limit: 100 } })
        .then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const pendingFulfilment = requests.filter(r => r.status === 'PENDING_FULFILMENT');
  const allFiltered = requests.filter(r => filterStatus ? r.status === filterStatus : true);
  const display = tab === 'pending' ? pendingFulfilment : allFiltered;

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(display.length / PAGE_SIZE));
  const pagedDisplay = display.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-ink">Device Request Queue</h1>
        <p className="text-sm text-ink-muted mt-0.5">Manage and fulfil approved device requests</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-5 border-b border-hair">
        {(['pending', 'all'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); }}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative
              ${tab === t
                ? 'border-b-2 border-indigo-600 text-indigo-600 -mb-px'
                : 'text-ink-muted hover:text-ink'}`}
          >
            {t === 'pending' ? 'Pending Fulfilment' : 'All Requests'}
            {t === 'pending' && pendingFulfilment.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-[#e0f0fe] text-indigo-600 text-[10px] font-semibold">
                {pendingFulfilment.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'all' && (
        <div className="mb-4">
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="rounded-lg border border-hair px-3 py-2 text-sm bg-white text-ink
                       focus:outline-none focus:border-2 focus:border-indigo-600"
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-xl border border-hair overflow-hidden">
        {!isLoading && display.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-ink-muted gap-3">
            <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">
              {tab === 'pending' ? 'No requests pending fulfilment' : 'No requests found'}
            </p>
          </div>
        )}

        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-hair">
              {['Request ID', 'Requester', 'Device Type', 'Justification', 'Status', 'Raised', 'Actions'].map(h => (
                <th key={h}
                  className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                             uppercase tracking-[0.06em] whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f2f2f7]">
            {isLoading && Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} />)}

            {!isLoading && pagedDisplay.map(req => (
              <tr key={req.id} className="hover:bg-[#fafafa]">
                <td className="px-4 py-3.5 font-mono text-xs text-indigo-600 font-medium whitespace-nowrap">
                  {req.id.slice(0, 12)}…
                </td>
                <td className="px-4 py-3.5">
                  <p className="font-medium text-ink text-xs">{req.requester.name}</p>
                  <p className="text-ink-muted text-xs">{req.requester.email}</p>
                </td>
                <td className="px-4 py-3.5 text-ink font-medium">{req.deviceType}</td>
                <td className="px-4 py-3.5 text-ink-muted text-xs max-w-xs">
                  <span className="line-clamp-2">{req.justification}</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
                    ${STATUS_STYLES[req.status] ?? 'bg-[#f2f2f7] text-[#6e6e73] border-hair'}`}>
                    {STATUS_LABEL[req.status] ?? req.status}
                  </span>
                  <p className="text-[11px] text-ink-muted mt-1 max-w-[180px]">
                    {deviceRequestNextStepForViewer(req.status, req.manager?.name)}
                  </p>
                </td>
                <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                  {formatDate(req.createdAt)}
                </td>
                <td className="px-4 py-3.5">
                  {req.status === 'PENDING_FULFILMENT' && (
                    <button
                      onClick={() => setAllocatingRequest(req)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600
                                 text-white hover:bg-indigo-700 whitespace-nowrap"
                    >
                      Allocate Device
                    </button>
                  )}
                  {req.allocation && (
                    <span className="text-xs text-ink-muted font-mono">
                      {req.allocation.device.id}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isLoading && display.length > 0 && (
        <Pagination page={page} totalPages={totalPages} total={display.length} onPageChange={setPage} />
      )}

      {allocatingRequest && (
        <AllocateModal
          request={allocatingRequest}
          onClose={() => setAllocatingRequest(null)}
          onAllocated={(deviceId) =>
            flash(`Allocated ${deviceId} to ${allocatingRequest.requester.name}. They can see it now under My Devices.`)
          }
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium bg-[#1a7f4b] text-white shadow-lg max-w-sm">
          {toast}
        </div>
      )}
    </Layout>
  );
}
