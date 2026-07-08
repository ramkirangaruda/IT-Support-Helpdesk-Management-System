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

const TERMINAL_BADGE: Record<string, string> = {
  REJECTED:         'bg-[#fff1f2] text-[#c0392b] border-[#fecdd3]',
  CANCELLED:        'bg-[#f2f2f7] text-[#6e6e73] border-hair',
  RETURNED:         'bg-[#f2f2f7] text-[#6e6e73] border-hair',
  RETURN_REQUESTED: 'bg-[#fef9ec] text-[#b07800] border-[#f0d870]',
};

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
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
        ${TERMINAL_BADGE[status] ?? 'bg-[#f2f2f7] text-[#6e6e73] border-hair'}`}>
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
              done   ? 'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]'
              : active ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-[#f2f2f7] text-[#8e8e93] border-hair'
            }`}>
              {step.label}
            </span>
            {i < TIMELINE.length - 1 && (
              <span className={`text-xs ${done ? 'text-[#1a7f4b]' : 'text-[#d2d2d7]'}`}>›</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-hair p-5 animate-pulse">
      <div className="flex justify-between mb-3">
        <div className="space-y-1.5">
          <div className="h-3 w-24 bg-[#f2f2f7] rounded" />
          <div className="h-5 w-32 bg-[#f2f2f7] rounded" />
        </div>
        <div className="h-3 w-16 bg-[#f2f2f7] rounded" />
      </div>
      <div className="h-4 w-full bg-[#f2f2f7] rounded mb-3" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-5 w-16 bg-[#f2f2f7] rounded-full" />
        ))}
      </div>
    </div>
  );
}

export default function MyDeviceRequestsPage() {
  const { data: requests = [], isLoading } = useQuery<DeviceRequest[]>({
    queryKey: ['my-device-requests'],
    queryFn: () =>
      api.get<{ data: DeviceRequest[] }>('/device-requests', { params: { limit: 100 } })
        .then(r => r.data.data),
  });

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">My Device Requests</h1>
          <p className="text-sm text-ink-muted mt-0.5">Track the status of your requests</p>
        </div>
        <Link
          to="/devices/request"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          + New Request
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {!isLoading && requests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-3">
          <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-medium">No device requests yet</p>
          <Link to="/devices/request" className="text-sm text-indigo-600 hover:underline">
            Submit your first request
          </Link>
        </div>
      )}

      {!isLoading && requests.length > 0 && (
        <div className="space-y-4">
          {requests.map(req => (
            <div key={req.id} className="bg-white rounded-xl border border-hair p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <span className="ticket-id">{req.id}</span>
                  <h3 className="text-base font-semibold text-ink mt-1">{req.deviceType}</h3>
                </div>
                <span className="text-xs text-ink-muted whitespace-nowrap mt-1">
                  {formatDate(req.createdAt)}
                </span>
              </div>

              <p className="text-sm text-ink-muted mb-3 line-clamp-2">{req.justification}</p>
              <RequestTimeline status={req.status} />

              {req.status === 'REJECTED' && req.comment && (
                <div className="mt-3 rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-3 py-2 text-xs text-[#c0392b]">
                  <span className="font-semibold">Reason: </span>{req.comment}
                </div>
              )}

              {req.allocation && (
                <div className="mt-3 rounded-lg bg-[#eafaf3] border border-[#a3d9b8] px-3 py-2 text-xs text-[#1a7f4b]">
                  <span className="font-semibold">Device: </span>
                  {req.allocation.device.id}
                  {req.allocation.device.makeModel ? ` — ${req.allocation.device.makeModel}` : ''}
                  <span className="text-[#1a7f4b] opacity-70 ml-3">
                    Allocated {formatDate(req.allocation.allocatedAt)}
                  </span>
                  {req.allocation.returnedOn && (
                    <span className="text-ink-muted ml-3">
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
