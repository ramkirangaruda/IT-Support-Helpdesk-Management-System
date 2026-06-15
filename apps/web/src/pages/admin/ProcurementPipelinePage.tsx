import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface Vendor {
  id: string;
  name: string;
  category: string;
}

interface PurchaseRequest {
  id: string;
  itemSpec: string;
  quantity: number;
  estCost: string;
  actualCost: string | null;
  budgetCode: string;
  poNumber: string | null;
  status: string;
  createdAt: string;
  receivedAt: string | null;
  raisedBy: { id: string; name: string; email: string };
  vendor: { id: string; name: string; category: string; leadTimeDays: number | null } | null;
  deviceRequest: {
    id: string;
    deviceType: string;
    requester: { id: string; name: string; email: string };
  } | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  RAISED:                   { label: 'Raised',           cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  PENDING_MANAGER_APPROVAL: { label: 'Pending Manager',  cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  MANAGER_APPROVED:         { label: 'Mgr Approved',     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  PENDING_FINANCE_APPROVAL: { label: 'Pending Finance',  cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  FINANCE_APPROVED:         { label: 'Finance Approved', cls: 'bg-green-50 text-green-700 border-green-200' },
  PO_RAISED:                { label: 'PO Raised',        cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  RECEIVED:                 { label: 'Received',         cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  REJECTED:                 { label: 'Rejected',         cls: 'bg-red-50 text-red-700 border-red-200' },
  ON_HOLD:                  { label: 'On Hold',          cls: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const FILTER_TABS = [
  { key: 'ALL',                    label: 'All' },
  { key: 'RAISED',                 label: 'Raised' },
  { key: 'PENDING_MANAGER_APPROVAL', label: 'Pending Manager' },
  { key: 'PENDING_FINANCE_APPROVAL', label: 'Pending Finance' },
  { key: 'FINANCE_APPROVED',       label: 'Finance Approved' },
  { key: 'PO_RAISED',              label: 'PO Raised' },
  { key: 'RECEIVED',               label: 'Received' },
  { key: 'REJECTED',               label: 'Rejected' },
  { key: 'ON_HOLD',                label: 'On Hold' },
];

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${m.cls}`}>
      {m.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── New PR Modal ──────────────────────────────────────────────────────────────

const newPrSchema = z.object({
  itemSpec:        z.string().min(3, 'At least 3 characters'),
  quantity:        z.string().regex(/^[1-9]\d*$/, 'Positive whole number required'),
  estCost:         z.string().regex(/^\d+(\.\d{1,2})?$/, 'e.g. 999.00'),
  budgetCode:      z.string().min(1, 'Required'),
  deviceRequestId: z.string().optional(),
});
type NewPrForm = z.infer<typeof newPrSchema>;

function NewPrModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<NewPrForm>({
    resolver: zodResolver(newPrSchema),
    defaultValues: { quantity: '1' },
  });
  const mutation = useMutation({
    mutationFn: (v: NewPrForm) =>
      api.post('/purchase-requests', {
        ...v,
        quantity: parseInt(v.quantity, 10),
        deviceRequestId: v.deviceRequestId || undefined,
      }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-prs'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">New Purchase Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Item Specification</label>
            <textarea {...register('itemSpec')} rows={2}
              placeholder="e.g. MacBook Pro 14-inch M3, 16GB RAM, 512GB SSD"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            {errors.itemSpec && <p className="text-xs text-red-600 mt-0.5">{errors.itemSpec.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Quantity</label>
              <input {...register('quantity')} type="text" inputMode="numeric" placeholder="1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              {errors.quantity && <p className="text-xs text-red-600 mt-0.5">{errors.quantity.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Est. Cost (£)</label>
              <input {...register('estCost')} type="text" inputMode="decimal" placeholder="999.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              {errors.estCost && <p className="text-xs text-red-600 mt-0.5">{errors.estCost.message}</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Budget Code</label>
            <input {...register('budgetCode')} type="text" placeholder="e.g. IT-2026-Q2"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {errors.budgetCode && <p className="text-xs text-red-600 mt-0.5">{errors.budgetCode.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Linked Device Request ID <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input {...register('deviceRequestId')} type="text" placeholder="dr_..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          {mutation.isError && <p className="text-xs text-red-600">Failed to create. Please try again.</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {mutation.isPending ? 'Raising…' : 'Raise Purchase Request'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Record PO Modal ───────────────────────────────────────────────────────────

const poSchema = z.object({
  poNumber:   z.string().min(1, 'Required'),
  vendorId:   z.string().min(1, 'Select a vendor'),
  actualCost: z.string().regex(/^\d+(\.\d{1,2})?$/, 'e.g. 999.00'),
});
type PoForm = z.infer<typeof poSchema>;

function PoModal({ pr, vendors, onClose }: { pr: PurchaseRequest; vendors: Vendor[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<PoForm>({
    resolver: zodResolver(poSchema),
    defaultValues: { actualCost: pr.estCost },
  });
  const mutation = useMutation({
    mutationFn: (v: PoForm) => api.post(`/purchase-requests/${pr.id}/po`, v).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-prs'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Record Purchase Order</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{pr.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">PO Number</label>
            <input {...register('poNumber')} type="text" placeholder="PO-2026-0001"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {errors.poNumber && <p className="text-xs text-red-600 mt-0.5">{errors.poNumber.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Vendor</label>
            <select {...register('vendorId')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">Select vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.category})</option>)}
            </select>
            {errors.vendorId && <p className="text-xs text-red-600 mt-0.5">{errors.vendorId.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Actual Cost (£)</label>
            <input {...register('actualCost')} type="text" inputMode="decimal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {errors.actualCost && <p className="text-xs text-red-600 mt-0.5">{errors.actualCost.message}</p>}
          </div>
          {mutation.isError && <p className="text-xs text-red-600">Failed. Please try again.</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Record PO'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Mark Received Modal ───────────────────────────────────────────────────────

const DEVICE_TYPES = ['Laptop', 'Monitor', 'Keyboard', 'Mouse', 'Headset', 'Phone', 'Other'];

const receiveSchema = z.object({
  type:         z.string().min(1, 'Required'),
  makeModel:    z.string().optional(),
  serialNumber: z.string().min(1, 'Required'),
  condition:    z.string().optional(),
});
type ReceiveForm = z.infer<typeof receiveSchema>;

function ReceiveModal({ pr, onClose }: { pr: PurchaseRequest; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<ReceiveForm>({
    resolver: zodResolver(receiveSchema),
    defaultValues: { type: pr.deviceRequest?.deviceType ?? '', condition: 'New' },
  });
  const mutation = useMutation({
    mutationFn: (v: ReceiveForm) =>
      api.post(`/purchase-requests/${pr.id}/receive`, v).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-prs'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Mark as Received</h2>
            <p className="text-xs text-gray-400 mt-0.5">This will add the device to the register</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Device Type</label>
            <select {...register('type')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="">Select type…</option>
              {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.type && <p className="text-xs text-red-600 mt-0.5">{errors.type.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Make / Model</label>
            <input {...register('makeModel')} type="text" placeholder="e.g. Apple MacBook Pro 14-inch"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Serial Number</label>
            <input {...register('serialNumber')} type="text" placeholder="SN-XXXXXXXXXX"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {errors.serialNumber && <p className="text-xs text-red-600 mt-0.5">{errors.serialNumber.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Condition</label>
            <select {...register('condition')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="New">New</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Poor">Poor</option>
            </select>
          </div>
          {mutation.isError && <p className="text-xs text-red-600">Failed. Please try again.</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
              {mutation.isPending ? 'Processing…' : 'Confirm Receipt'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProcurementPipelinePage() {
  const [filter, setFilter] = useState('ALL');
  const [showNewModal, setShowNewModal] = useState(false);
  const [poTarget, setPoTarget] = useState<PurchaseRequest | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseRequest | null>(null);

  const { data: prs = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['procurement-prs'],
    queryFn: () => api.get<PurchaseRequest[]>('/purchase-requests').then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: () => api.get<Vendor[]>('/vendors').then(r => r.data),
  });

  const filtered = filter === 'ALL' ? prs : prs.filter(pr => pr.status === filter);

  const counts = prs.reduce<Record<string, number>>((acc, pr) => {
    acc[pr.status] = (acc[pr.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Layout>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Procurement Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {prs.length} purchase request{prs.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          + New Purchase Request
        </button>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTER_TABS.map(tab => {
          const cnt = tab.key === 'ALL' ? prs.length : (counts[tab.key] ?? 0);
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
              }`}
            >
              {tab.label}
              {cnt > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  active ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border border-gray-200">
          <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm font-medium">No purchase requests{filter !== 'ALL' ? ' in this status' : ''}</p>
          {filter !== 'ALL' && (
            <button onClick={() => setFilter('ALL')} className="text-xs text-indigo-500 hover:underline mt-1">
              View all
            </button>
          )}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['PR ID', 'Item', 'Qty', 'Est. Cost', 'Budget Code', 'Vendor', 'Status', 'Raised', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(pr => (
                  <tr key={pr.id} className="hover:bg-gray-50 transition-colors">
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-semibold text-gray-800">£{pr.estCost}</p>
                      {pr.actualCost && pr.actualCost !== pr.estCost && (
                        <p className="text-xs text-teal-600">Actual: £{pr.actualCost}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{pr.budgetCode}</td>
                    <td className="px-4 py-3 text-xs">
                      {pr.vendor ? (
                        <div>
                          <p className="font-medium text-gray-700">{pr.vendor.name}</p>
                          {pr.vendor.leadTimeDays != null && (
                            <p className="text-gray-400">{pr.vendor.leadTimeDays}d lead</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={pr.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(pr.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {pr.status === 'FINANCE_APPROVED' && (
                          <button
                            onClick={() => setPoTarget(pr)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
                          >
                            Record PO
                          </button>
                        )}
                        {pr.status === 'PO_RAISED' && (
                          <button
                            onClick={() => setReceiveTarget(pr)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors whitespace-nowrap"
                          >
                            Mark Received
                          </button>
                        )}
                        {!['FINANCE_APPROVED', 'PO_RAISED'].includes(pr.status) && (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNewModal && <NewPrModal onClose={() => setShowNewModal(false)} />}
      {poTarget && <PoModal pr={poTarget} vendors={vendors} onClose={() => setPoTarget(null)} />}
      {receiveTarget && <ReceiveModal pr={receiveTarget} onClose={() => setReceiveTarget(null)} />}
    </Layout>
  );
}
