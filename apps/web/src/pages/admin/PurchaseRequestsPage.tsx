import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../../api/api';
import Layout from '../../components/Layout';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PurchaseRequest {
  id: string;
  itemSpec: string;
  quantity: number;
  estCost: string;
  actualCost: string | null;
  budgetCode: string;
  poNumber: string | null;
  receivedAt: string | null;
  status: string;
  createdAt: string;
  raisedBy: { id: string; name: string; email: string };
  vendor: { id: string; name: string; category: string } | null;
  deviceRequest: {
    id: string;
    deviceType: string;
    status: string;
    requester: { id: string; name: string; email: string };
  } | null;
  approvalSteps?: ApprovalStep[];
}

interface ApprovalStep {
  id: string;
  role: string;
  decision: string;
  comment: string | null;
  decidedAt: string;
  approver: { id: string; name: string; email: string };
}

interface Vendor {
  id: string;
  name: string;
  category: string;
  leadTimeDays: number | null;
  rating: number | null;
  active: boolean;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  RAISED:                    'bg-gray-100 text-gray-600 border-gray-200',
  PENDING_MANAGER_APPROVAL:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  MANAGER_APPROVED:          'bg-blue-50 text-blue-700 border-blue-200',
  PENDING_FINANCE_APPROVAL:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  FINANCE_APPROVED:          'bg-teal-50 text-teal-700 border-teal-200',
  PO_RAISED:                 'bg-purple-50 text-purple-700 border-purple-200',
  RECEIVED:                  'bg-green-50 text-green-700 border-green-200',
  REJECTED:                  'bg-red-50 text-red-700 border-red-200',
  ON_HOLD:                   'bg-orange-50 text-orange-700 border-orange-200',
};

const STATUS_LABEL: Record<string, string> = {
  RAISED:                    'Raised',
  PENDING_MANAGER_APPROVAL:  'Pending Manager',
  MANAGER_APPROVED:          'Manager Approved',
  PENDING_FINANCE_APPROVAL:  'Pending Finance',
  FINANCE_APPROVED:          'Finance Approved',
  PO_RAISED:                 'PO Raised',
  RECEIVED:                  'Received',
  REJECTED:                  'Rejected',
  ON_HOLD:                   'On Hold',
};

const DECISION_STYLES: Record<string, string> = {
  APPROVED: 'text-green-700',
  REJECTED: 'text-red-600',
  ON_HOLD:  'text-orange-600',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

// ── New PR Modal ──────────────────────────────────────────────────────────────

const createSchema = z.object({
  itemSpec:        z.string().min(3, 'Minimum 3 characters'),
  quantity:        z.string().regex(/^[1-9]\d*$/, 'Must be a positive whole number'),
  estCost:         z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount e.g. 999.99'),
  budgetCode:      z.string().min(1, 'Required'),
  deviceRequestId: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

function NewPrModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { quantity: '1' },
  });

  const createMutation = useMutation({
    mutationFn: (v: CreateForm) =>
      api.post('/purchase-requests', { ...v, quantity: parseInt(v.quantity, 10) }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Purchase Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form
          onSubmit={handleSubmit(v => createMutation.mutateAsync(v))}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Item Specification <span className="text-red-500">*</span></label>
            <input {...register('itemSpec')} type="text" placeholder="e.g. Laptop Dell XPS 15 i7"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <FieldError message={errors.itemSpec?.message} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity <span className="text-red-500">*</span></label>
              <input {...register('quantity')} type="number" min={1}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <FieldError message={errors.quantity?.message} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Est. Cost (£) <span className="text-red-500">*</span></label>
              <input {...register('estCost')} type="text" placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <FieldError message={errors.estCost?.message} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Budget Code <span className="text-red-500">*</span></label>
            <input {...register('budgetCode')} type="text" placeholder="e.g. IT-CAPEX-2026"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <FieldError message={errors.budgetCode?.message} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Linked Device Request ID <span className="text-gray-400 font-normal">(optional)</span></label>
            <input {...register('deviceRequestId')} type="text" placeholder="cuid…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {createMutation.isError && (
            <p className="text-xs text-red-600">Failed to create request. Please try again.</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={createMutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {createMutation.isPending ? 'Creating…' : 'Submit for Approval'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── PO Modal ──────────────────────────────────────────────────────────────────

const poSchema = z.object({
  poNumber:   z.string().min(1, 'Required'),
  vendorId:   z.string().min(1, 'Select a vendor'),
  actualCost: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount'),
});
type PoForm = z.infer<typeof poSchema>;

function PoModal({ prId, onClose }: { prId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<PoForm>({ resolver: zodResolver(poSchema) });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: () => api.get<Vendor[]>('/vendors').then(r => r.data),
  });

  const mutation = useMutation({
    mutationFn: (v: PoForm) => api.post(`/purchase-requests/${prId}/po`, v).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pr-detail', prId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Record Purchase Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit(v => mutation.mutateAsync(v))} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">PO Number <span className="text-red-500">*</span></label>
            <input {...register('poNumber')} type="text" placeholder="PO-2026-XXXX"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <FieldError message={errors.poNumber?.message} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vendor <span className="text-red-500">*</span></label>
            <select {...register('vendorId')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Select vendor…</option>
              {vendors.filter(v => v.active).map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.category})</option>
              ))}
            </select>
            <FieldError message={errors.vendorId?.message} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Actual Cost (£) <span className="text-red-500">*</span></label>
            <input {...register('actualCost')} type="text" placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <FieldError message={errors.actualCost?.message} />
          </div>

          {mutation.isError && <p className="text-xs text-red-600">Failed. Please try again.</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={mutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Record PO'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Receive Modal ─────────────────────────────────────────────────────────────

const receiveSchema = z.object({
  type:         z.string().min(1, 'Required'),
  makeModel:    z.string().optional(),
  serialNumber: z.string().min(1, 'Required'),
  condition:    z.string().optional(),
});
type ReceiveForm = z.infer<typeof receiveSchema>;

function ReceiveModal({ prId, itemSpec, onClose }: { prId: string; itemSpec: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<ReceiveForm>({
    resolver: zodResolver(receiveSchema),
    defaultValues: { type: itemSpec.split(' ')[0] },
  });

  const mutation = useMutation({
    mutationFn: (v: ReceiveForm) => api.post(`/purchase-requests/${prId}/receive`, v).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pr-detail', prId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Record Receipt</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 pt-3 pb-1">
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
            Item: <span className="font-medium text-gray-700">{itemSpec}</span>
          </p>
        </div>
        <form onSubmit={handleSubmit(v => mutation.mutateAsync(v))} className="px-6 pb-6 space-y-4 mt-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Device Type <span className="text-red-500">*</span></label>
              <input {...register('type')} type="text" placeholder="e.g. Laptop"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <FieldError message={errors.type?.message} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Make / Model</label>
              <input {...register('makeModel')} type="text" placeholder="e.g. Dell XPS 15"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Serial Number <span className="text-red-500">*</span></label>
              <input {...register('serialNumber')} type="text" placeholder="SN-XXXXXXX"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <FieldError message={errors.serialNumber?.message} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
              <input {...register('condition')} type="text" placeholder="e.g. New"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          {mutation.isError && <p className="text-xs text-red-600">Failed. Please try again.</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={mutation.isPending}
              className="px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {mutation.isPending ? 'Registering…' : 'Confirm Receipt & Register Device'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── PR Detail Drawer ──────────────────────────────────────────────────────────

function PrDetailDrawer({
  prId,
  onClose,
  onPo,
  onReceive,
}: {
  prId: string;
  onClose: () => void;
  onPo: () => void;
  onReceive: () => void;
}) {
  const { data: pr, isLoading } = useQuery<PurchaseRequest>({
    queryKey: ['pr-detail', prId],
    queryFn: () => api.get<PurchaseRequest>(`/purchase-requests/${prId}`).then(r => r.data),
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">Purchase Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">Loading…</div>
        )}

        {pr && (
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-indigo-600 font-semibold">{pr.id}</p>
                <h3 className="text-lg font-semibold text-gray-900 mt-0.5">{pr.itemSpec}</h3>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border whitespace-nowrap ${STATUS_STYLES[pr.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {STATUS_LABEL[pr.status] ?? pr.status}
              </span>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Quantity',    String(pr.quantity)],
                ['Est. Cost',   `£${pr.estCost}`],
                ['Actual Cost', pr.actualCost ? `£${pr.actualCost}` : '—'],
                ['Budget Code', pr.budgetCode],
                ['PO Number',   pr.poNumber ?? '—'],
                ['Received',    formatDate(pr.receivedAt)],
                ['Raised by',   pr.raisedBy.name],
                ['Vendor',      pr.vendor?.name ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 font-medium">{label}</p>
                  <p className="text-gray-800 font-medium">{value}</p>
                </div>
              ))}
            </div>

            {/* Linked device request */}
            {pr.deviceRequest && (
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs">
                <p className="font-semibold text-blue-700 mb-1">Linked Device Request</p>
                <p className="text-blue-600">{pr.deviceRequest.deviceType} — {pr.deviceRequest.requester.name}</p>
                <p className="text-blue-400 font-mono mt-0.5">{pr.deviceRequest.id}</p>
              </div>
            )}

            {/* Approval trail */}
            {(pr.approvalSteps?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Approval Trail</p>
                <div className="space-y-2">
                  {pr.approvalSteps!.map(step => (
                    <div key={step.id} className="flex items-start gap-3 text-xs">
                      <div className={`mt-0.5 font-semibold ${DECISION_STYLES[step.decision] ?? 'text-gray-600'}`}>
                        {step.decision}
                      </div>
                      <div className="flex-1">
                        <span className="text-gray-700 font-medium">{step.approver.name}</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className="text-gray-400">{step.role}</span>
                        <span className="text-gray-400 mx-1">·</span>
                        <span className="text-gray-400">{formatDate(step.decidedAt)}</span>
                        {step.comment && (
                          <p className="text-gray-500 mt-0.5 italic">"{step.comment}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              {pr.status === 'FINANCE_APPROVED' && (
                <button onClick={onPo}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
                  Record PO
                </button>
              )}
              {pr.status === 'PO_RAISED' && (
                <button onClick={onReceive}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
                  Record Receipt & Register Device
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PurchaseRequestsPage() {
  const [showNew, setShowNew] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [poId, setPoId] = useState<string | null>(null);
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [receiveItemSpec, setReceiveItemSpec] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data: prs = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['purchase-requests'],
    queryFn: () => api.get<{ data: PurchaseRequest[] }>('/purchase-requests', { params: { limit: 100 } }).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const filtered = filterStatus ? prs.filter(p => p.status === filterStatus) : prs;

  const counts = Object.entries(STATUS_LABEL).reduce<Record<string, number>>((acc, [key]) => {
    acc[key] = prs.filter(p => p.status === key).length;
    return acc;
  }, {});

  const detailPr = prs.find(p => p.id === detailId);

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {prs.length} total · {counts['PENDING_MANAGER_APPROVAL'] ?? 0} awaiting manager ·{' '}
            {counts['PENDING_FINANCE_APPROVAL'] ?? 0} awaiting finance
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + New Request
        </button>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
            filterStatus === '' ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-500 border-gray-200 hover:border-gray-400'
          }`}
        >
          All ({prs.length})
        </button>
        {Object.entries(STATUS_LABEL).filter(([k]) => (counts[k] ?? 0) > 0).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key === filterStatus ? '' : key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              filterStatus === key
                ? `${STATUS_STYLES[key] ?? ''} border-current`
                : 'text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm font-medium">No purchase requests</p>
          </div>
        )}
        {!isLoading && filtered.length > 0 && (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Ref', 'Item', 'Qty', 'Est. Cost', 'Budget Code', 'Vendor', 'Status', 'Raised', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(pr => (
                <tr key={pr.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setDetailId(pr.id)}>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">{pr.id}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="font-medium text-gray-800 line-clamp-1">{pr.itemSpec}</span>
                    {pr.deviceRequest && (
                      <span className="text-xs text-blue-500 block">↳ {pr.deviceRequest.deviceType} request</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-center">{pr.quantity}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">£{pr.estCost}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{pr.budgetCode}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{pr.vendor?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLES[pr.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {STATUS_LABEL[pr.status] ?? pr.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDate(pr.createdAt)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1.5">
                      {pr.status === 'FINANCE_APPROVED' && (
                        <button
                          onClick={() => setPoId(pr.id)}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors whitespace-nowrap"
                        >
                          PO
                        </button>
                      )}
                      {pr.status === 'PO_RAISED' && (
                        <button
                          onClick={() => { setReceiveId(pr.id); setReceiveItemSpec(pr.itemSpec); }}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-colors whitespace-nowrap"
                        >
                          Receive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showNew && <NewPrModal onClose={() => setShowNew(false)} />}
      {poId && <PoModal prId={poId} onClose={() => setPoId(null)} />}
      {receiveId && (
        <ReceiveModal
          prId={receiveId}
          itemSpec={receiveItemSpec}
          onClose={() => { setReceiveId(null); setReceiveItemSpec(''); }}
        />
      )}
      {detailId && (
        <PrDetailDrawer
          prId={detailId}
          onClose={() => setDetailId(null)}
          onPo={() => { setPoId(detailId); setDetailId(null); }}
          onReceive={() => {
            setReceiveId(detailId);
            setReceiveItemSpec(detailPr?.itemSpec ?? '');
            setDetailId(null);
          }}
        />
      )}
    </Layout>
  );
}
