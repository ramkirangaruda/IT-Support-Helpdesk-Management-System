import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../../api/api';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';

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
  RAISED:                   { label: 'Raised',           cls: 'bg-[#f2f2f7] text-[#6e6e73] border-hair' },
  PENDING_MANAGER_APPROVAL: { label: 'Pending Manager',  cls: 'bg-[#fef9ec] text-[#b07800] border-[#f0d870]' },
  MANAGER_APPROVED:         { label: 'Mgr Approved',     cls: 'bg-[#e0f0fe] text-[#0071e3] border-[#b6d8ff]' },
  PENDING_FINANCE_APPROVAL: { label: 'Pending Finance',  cls: 'bg-[#eef0fb] text-[#3b5cc3] border-[#c7cef8]' },
  FINANCE_APPROVED:         { label: 'Finance Approved', cls: 'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]' },
  PO_RAISED:                { label: 'PO Raised',        cls: 'bg-[#e0f0fe] text-indigo-600 border-[#b6d8ff]' },
  RECEIVED:                 { label: 'Received',         cls: 'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]' },
  REJECTED:                 { label: 'Rejected',         cls: 'bg-[#fff1f2] text-[#c0392b] border-[#fecdd3]' },
  ON_HOLD:                  { label: 'On Hold',          cls: 'bg-[#fef9ec] text-[#b07800] border-[#f0d870]' },
};

const FILTER_TABS = [
  { key: 'ALL',                     label: 'All' },
  { key: 'RAISED',                  label: 'Raised' },
  { key: 'PENDING_MANAGER_APPROVAL',label: 'Pending Manager' },
  { key: 'PENDING_FINANCE_APPROVAL',label: 'Pending Finance' },
  { key: 'FINANCE_APPROVED',        label: 'Finance Approved' },
  { key: 'PO_RAISED',               label: 'PO Raised' },
  { key: 'RECEIVED',                label: 'Received' },
  { key: 'REJECTED',                label: 'Rejected' },
  { key: 'ON_HOLD',                 label: 'On Hold' },
];

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: 'bg-[#f2f2f7] text-[#6e6e73] border-hair' };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${m.cls}`}>
      {m.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const inputCls =
  'w-full rounded-lg border border-hair px-3 py-2 text-sm focus:outline-none focus:border-2 focus:border-indigo-600';

function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-hair overflow-hidden animate-pulse">
      <div className="border-b border-hair h-10" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3.5 border-b border-[#f2f2f7] last:border-0">
          <div className="h-4 w-24 bg-[#f2f2f7] rounded" />
          <div className="h-4 flex-1 bg-[#f2f2f7] rounded" />
          <div className="h-4 w-16 bg-[#f2f2f7] rounded" />
        </div>
      ))}
    </div>
  );
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
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-hair w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hair">
          <h2 className="font-semibold text-ink">New Purchase Request</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Item Specification
            </label>
            <textarea {...register('itemSpec')} rows={2}
              placeholder="e.g. MacBook Pro 14-inch M3, 16GB RAM, 512GB SSD"
              className={`${inputCls} resize-none`} />
            {errors.itemSpec && <p className="text-xs text-[#c0392b] mt-0.5">{errors.itemSpec.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
                Quantity
              </label>
              <input {...register('quantity')} type="text" inputMode="numeric" placeholder="1"
                className={inputCls} />
              {errors.quantity && <p className="text-xs text-[#c0392b] mt-0.5">{errors.quantity.message}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
                Est. Cost (₹)
              </label>
              <input {...register('estCost')} type="text" inputMode="decimal" placeholder="999.00"
                className={inputCls} />
              {errors.estCost && <p className="text-xs text-[#c0392b] mt-0.5">{errors.estCost.message}</p>}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Budget Code
            </label>
            <input {...register('budgetCode')} type="text" placeholder="e.g. IT-2026-Q2"
              className={inputCls} />
            {errors.budgetCode && <p className="text-xs text-[#c0392b] mt-0.5">{errors.budgetCode.message}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Linked Device Request ID{' '}
              <span className="normal-case text-ink-muted font-normal">(optional)</span>
            </label>
            <input {...register('deviceRequestId')} type="text" placeholder="dr_..."
              className={inputCls} />
          </div>
          {mutation.isError && <p className="text-xs text-[#c0392b]">Failed to create. Please try again.</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold
                         hover:bg-indigo-700 disabled:opacity-50">
              {mutation.isPending ? 'Raising…' : 'Raise Purchase Request'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]">
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
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-hair w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hair">
          <div>
            <h2 className="font-semibold text-ink">Record Purchase Order</h2>
            <p className="text-xs text-ink-muted mt-0.5 font-mono">{pr.id}</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              PO Number
            </label>
            <input {...register('poNumber')} type="text" placeholder="PO-2026-0001"
              className={inputCls} />
            {errors.poNumber && <p className="text-xs text-[#c0392b] mt-0.5">{errors.poNumber.message}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Vendor
            </label>
            <select {...register('vendorId')} className={`${inputCls} bg-white`}>
              <option value="">Select vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.category})</option>)}
            </select>
            {errors.vendorId && <p className="text-xs text-[#c0392b] mt-0.5">{errors.vendorId.message}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Actual Cost (₹)
            </label>
            <input {...register('actualCost')} type="text" inputMode="decimal"
              className={inputCls} />
            {errors.actualCost && <p className="text-xs text-[#c0392b] mt-0.5">{errors.actualCost.message}</p>}
          </div>
          {mutation.isError && <p className="text-xs text-[#c0392b]">Failed. Please try again.</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold
                         hover:bg-indigo-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Record PO'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]">
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
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-hair w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hair">
          <div>
            <h2 className="font-semibold text-ink">Mark as Received</h2>
            <p className="text-xs text-ink-muted mt-0.5">This will add the device to the register</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Device Type
            </label>
            <select {...register('type')} className={`${inputCls} bg-white`}>
              <option value="">Select type…</option>
              {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.type && <p className="text-xs text-[#c0392b] mt-0.5">{errors.type.message}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Make / Model
            </label>
            <input {...register('makeModel')} type="text" placeholder="e.g. Apple MacBook Pro 14-inch"
              className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Serial Number
            </label>
            <input {...register('serialNumber')} type="text" placeholder="SN-XXXXXXXXXX"
              className={inputCls} />
            {errors.serialNumber && <p className="text-xs text-[#c0392b] mt-0.5">{errors.serialNumber.message}</p>}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Condition
            </label>
            <select {...register('condition')} className={`${inputCls} bg-white`}>
              <option value="New">New</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Poor">Poor</option>
            </select>
          </div>
          {mutation.isError && <p className="text-xs text-[#c0392b]">Failed. Please try again.</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2 rounded-lg bg-[#1a7f4b] text-white text-sm font-semibold
                         hover:bg-[#166940] disabled:opacity-50">
              {mutation.isPending ? 'Processing…' : 'Confirm Receipt'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]">
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
  const [page, setPage] = useState(1);
  const [showNewModal, setShowNewModal] = useState(false);
  const [poTarget, setPoTarget] = useState<PurchaseRequest | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseRequest | null>(null);

  const { data: prs = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['procurement-prs'],
    queryFn: () =>
      api.get<{ data: PurchaseRequest[] }>('/purchase-requests', { params: { limit: 100 } })
        .then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: () => api.get<Vendor[]>('/vendors').then(r => r.data),
  });

  const filtered = filter === 'ALL' ? prs : prs.filter(pr => pr.status === filter);
  const PAGE_SIZE  = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = prs.reduce<Record<string, number>>((acc, pr) => {
    acc[pr.status] = (acc[pr.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Layout>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Procurement Pipeline</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {prs.length} purchase request{prs.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
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
              onClick={() => { setFilter(tab.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                active
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-ink-muted border-hair hover:bg-[#fafafa]'
              }`}
            >
              {tab.label}
              {cnt > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  active ? 'bg-white/20 text-white' : 'bg-[#f2f2f7] text-ink-muted'
                }`}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading && <TableSkeleton />}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3
                        bg-white rounded-xl border border-hair">
          <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm font-medium text-ink-muted">
            No purchase requests{filter !== 'ALL' ? ' in this status' : ''}
          </p>
          {filter !== 'ALL' && (
            <button onClick={() => setFilter('ALL')}
              className="text-xs text-indigo-600 hover:underline">
              View all
            </button>
          )}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-hair overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-hair">
                  {['PR ID', 'Item', 'Qty', 'Est. Cost', 'Budget Code', 'Vendor', 'Status', 'Raised', 'Actions'].map(h => (
                    <th key={h}
                      className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                                 uppercase tracking-[0.06em] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f2f7]">
                {paged.map(pr => (
                  <tr key={pr.id} className="hover:bg-[#fafafa]">
                    <td className="px-4 py-3.5 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
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
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="font-semibold text-ink">₹{pr.estCost}</p>
                      {pr.actualCost && pr.actualCost !== pr.estCost && (
                        <p className="text-xs text-[#1a7f4b]">Actual: ₹{pr.actualCost}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-ink-muted text-xs font-mono">{pr.budgetCode}</td>
                    <td className="px-4 py-3.5 text-xs">
                      {pr.vendor ? (
                        <div>
                          <p className="font-medium text-ink-soft">{pr.vendor.name}</p>
                          {pr.vendor.leadTimeDays != null && (
                            <p className="text-ink-muted">{pr.vendor.leadTimeDays}d lead</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={pr.status} />
                    </td>
                    <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                      {formatDate(pr.createdAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-2">
                        {pr.status === 'FINANCE_APPROVED' && (
                          <button
                            onClick={() => setPoTarget(pr)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap
                                       bg-[#e0f0fe] border border-[#b6d8ff] text-indigo-600
                                       hover:bg-[#cce5fc]"
                          >
                            Record PO
                          </button>
                        )}
                        {pr.status === 'PO_RAISED' && (
                          <button
                            onClick={() => setReceiveTarget(pr)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap
                                       bg-[#eafaf3] border border-[#a3d9b8] text-[#1a7f4b]
                                       hover:bg-[#d6f4e7]"
                          >
                            Mark Received
                          </button>
                        )}
                        {!['FINANCE_APPROVED', 'PO_RAISED'].includes(pr.status) && (
                          <span className="text-ink-muted text-xs">—</span>
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

      {!isLoading && filtered.length > 0 && (
        <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
      )}

      {showNewModal && <NewPrModal onClose={() => setShowNewModal(false)} />}
      {poTarget && <PoModal pr={poTarget} vendors={vendors} onClose={() => setPoTarget(null)} />}
      {receiveTarget && <ReceiveModal pr={receiveTarget} onClose={() => setReceiveTarget(null)} />}
    </Layout>
  );
}
