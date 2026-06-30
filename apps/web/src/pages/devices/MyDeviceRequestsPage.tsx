import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface DeviceRequest {
  id: string;
  deviceType: string;
  justification: string;
  status: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  requester: { id: string; name: string; email: string };
  manager: { id: string; name: string; email: string } | null;
  allocation: {
    device: { id: string; type: string; makeModel: string | null };
    allocatedAt: string;
    returnedOn: string | null;
  } | null;
}

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

const TIMELINE: { status: string; label: string }[] = [
  { status: 'SUBMITTED',                label: 'Submitted' },
  { status: 'PENDING_MANAGER_APPROVAL', label: 'Manager Review' },
  { status: 'APPROVED',                 label: 'Approved' },
  { status: 'PENDING_FULFILMENT',       label: 'IT Fulfilment' },
  { status: 'ALLOCATED',                label: 'Allocated' },
];

const REJECTED_STATUSES = new Set(['REJECTED', 'CANCELLED', 'RETURNED', 'RETURN_REQUESTED']);

function statusIndex(s: string) {
  return TIMELINE.findIndex(t => t.status === s);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function RequestTimeline({ status }: { status: string }) {
  if (REJECTED_STATUSES.has(status)) {
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
        {STATUS_LABEL[status] ?? status}
      </span>
    );
  }

  const current = statusIndex(status);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {TIMELINE.map((step, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={step.status} className="flex items-center gap-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
              done   ? 'bg-green-50 text-green-700 border-green-200'
              : active ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-gray-50 text-gray-400 border-gray-200'
            }`}>
              {step.label}
            </span>
            {i < TIMELINE.length - 1 && (
              <span className={`text-xs ${done ? 'text-green-400' : 'text-gray-200'}`}>›</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function MyDeviceRequestsPage() {
  const { data: requests = [], isLoading } = useQuery<DeviceRequest[]>({
    queryKey: ['my-device-requests'],
    queryFn: () => api.get<{ data: DeviceRequest[] }>('/device-requests', { params: { limit: 100 } }).then(r => r.data.data),
  });

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Device Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track the status of your requests</p>
        </div>
        <Link
          to="/devices/request"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                     hover:bg-indigo-700 transition-colors"
        >
          + New Request
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>
      )}

      {!isLoading && requests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-medium">No device requests yet</p>
          <Link to="/devices/request" className="mt-3 text-sm text-indigo-600 hover:underline">
            Submit your first request
          </Link>
        </div>
      )}

      {!isLoading && requests.length > 0 && (
        <div className="space-y-4">
          {requests.map(req => (
            <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <span className="font-mono text-xs text-indigo-600 font-semibold">{req.id}</span>
                  <h3 className="text-base font-semibold text-gray-900 mt-0.5">{req.deviceType}</h3>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap mt-1">
                  {formatDate(req.createdAt)}
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{req.justification}</p>

              <RequestTimeline status={req.status} />

              {/* Rejection comment */}
              {req.status === 'REJECTED' && req.comment && (
                <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                  <span className="font-semibold">Reason: </span>{req.comment}
                </div>
              )}

              {/* Allocation info */}
              {req.allocation && (
                <div className="mt-3 rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-xs text-green-800">
                  <span className="font-semibold">Device: </span>
                  {req.allocation.device.id}
                  {req.allocation.device.makeModel ? ` — ${req.allocation.device.makeModel}` : ''}
                  <span className="text-green-600 ml-3">
                    Allocated {formatDate(req.allocation.allocatedAt)}
                  </span>
                  {req.allocation.returnedOn && (
                    <span className="text-gray-500 ml-3">
                      Returned {formatDate(req.allocation.returnedOn)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
