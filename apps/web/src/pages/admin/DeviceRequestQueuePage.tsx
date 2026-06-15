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

// ── Style helpers ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  SUBMITTED:                'bg-blue-50 text-blue-700 border-blue-200',
  PENDING_MANAGER_APPROVAL: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  APPROVED:                 'bg-green-50 text-green-700 border-green-200',
  REJECTED:                 'bg-red-50 text-red-700 border-red-200',
  PENDING_FULFILMENT:       'bg-indigo-50 text-indigo-700 border-indigo-200',
  ALLOCATED:                'bg-green-50 text-green-800 border-green-200',
  RETURN_REQUESTED:         'bg-orange-50 text-orange-700 border-orange-200',
  RETURNED:                 'bg-gray-100 text-gray-600 border-gray-200',
  CANCELLED:                'bg-gray-100 text-gray-500 border-gray-200',
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

// ── Allocate Device Modal ─────────────────────────────────────────────────────

function AllocateModal({
  request,
  onClose,
}: {
  request: DeviceRequest;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [deviceId, setDeviceId] = useState('');

  const { data: available = [], isLoading } = useQuery<AvailableDevice[]>({
    queryKey: ['devices-available', request.deviceType],
    queryFn: () =>
      api.get<AvailableDevice[]>('/devices', { params: { status: 'AVAILABLE', type: request.deviceType } })
        .then(r => r.data),
  });

  const allocateMutation = useMutation({
    mutationFn: () =>
      api.post(`/device-requests/${request.id}/allocate`, { deviceId }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-requests'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Allocate Device</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 pt-4">
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-sm mb-4">
            <p className="font-semibold text-gray-800">{request.requester.name}</p>
            <p className="text-gray-500 text-xs">{request.requester.email}</p>
            <p className="text-gray-600 text-xs mt-1">Requested: <span className="font-medium">{request.deviceType}</span></p>
          </div>

          <label className="block text-xs font-medium text-gray-600 mb-1">
            Select Available {request.deviceType}
          </label>

          {isLoading && <p className="text-sm text-gray-400 py-2">Loading available devices…</p>}

          {!isLoading && available.length === 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 mb-4">
              No available {request.deviceType} devices in stock.
            </div>
          )}

          {available.length > 0 && (
            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {available.map(d => (
                <label
                  key={d.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    deviceId === d.id
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="device"
                    value={d.id}
                    checked={deviceId === d.id}
                    onChange={() => setDeviceId(d.id)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 font-mono">{d.id}</p>
                    <p className="text-xs text-gray-500">
                      {d.makeModel ?? 'No model'} · SN: {d.serialNumber}
                      {d.condition ? ` · ${d.condition}` : ''}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {allocateMutation.isError && (
            <p className="text-xs text-red-600 mb-3">Allocation failed. Please try again.</p>
          )}

          <div className="flex gap-3 pb-6">
            <button
              onClick={() => allocateMutation.mutate()}
              disabled={!deviceId || allocateMutation.isPending || available.length === 0}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {allocateMutation.isPending ? 'Allocating…' : 'Allocate'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                         hover:bg-gray-50 transition-colors"
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

  const { data: requests = [], isLoading } = useQuery<DeviceRequest[]>({
    queryKey: ['device-requests'],
    queryFn: () => api.get<DeviceRequest[]>('/device-requests').then(r => r.data),
    refetchInterval: 30_000,
  });

  const pendingFulfilment = requests.filter(r => r.status === 'PENDING_FULFILMENT');

  const allFiltered = requests.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  const display = tab === 'pending' ? pendingFulfilment : allFiltered;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Device Request Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage and fulfil approved device requests</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['pending', 'all'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
              tab === t
                ? 'bg-white border-gray-200 text-indigo-600 -mb-px'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {t === 'pending' ? 'Pending Fulfilment' : 'All Requests'}
            {t === 'pending' && pendingFulfilment.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
                {pendingFulfilment.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* "All" tab filter */}
      {tab === 'all' && (
        <div className="mb-4">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
        )}

        {!isLoading && display.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-10 h-10 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium">
              {tab === 'pending' ? 'No requests pending fulfilment' : 'No requests found'}
            </p>
          </div>
        )}

        {!isLoading && display.length > 0 && (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Request ID', 'Requester', 'Device Type', 'Justification', 'Status', 'Raised', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {display.map(req => (
                <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
                    {req.id.slice(0, 12)}…
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 text-xs">{req.requester.name}</p>
                    <p className="text-gray-400 text-xs">{req.requester.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{req.deviceType}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs">
                    <span className="line-clamp-2">{req.justification}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLES[req.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {STATUS_LABEL[req.status] ?? req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {formatDate(req.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {req.status === 'PENDING_FULFILMENT' && (
                      <button
                        onClick={() => setAllocatingRequest(req)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600
                                   text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
                      >
                        Allocate Device
                      </button>
                    )}
                    {req.allocation && (
                      <span className="text-xs text-gray-500">
                        {req.allocation.device.id}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {allocatingRequest && (
        <AllocateModal
          request={allocatingRequest}
          onClose={() => setAllocatingRequest(null)}
        />
      )}
    </Layout>
  );
}
