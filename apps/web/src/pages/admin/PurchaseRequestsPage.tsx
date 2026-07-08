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
  RAISED:                    'bg-[#f2f2f7] text-[#6e6e73] border-hair',
  PENDING_MANAGER_APPROVAL:  'bg-[#fef9ec] text-[#b07800] border-[#f0d870]',
  MANAGER_APPROVED:          'bg-[#e0f0fe] text-[#0071e3] border-[#b6d8ff]',
  PENDING_FINANCE_APPROVAL:  'bg-[#eef0fb] text-[#3b5cc3] border-[#c7cef8]',
  FINANCE_APPROVED:          'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]',
  PO_RAISED:                 'bg-[#e0f0fe] text-indigo-600 border-[#b6d8ff]',
  RECEIVED:                  'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]',
  REJECTED:                  'bg-[#fff1f2] text-[#c0392b] border-[#fecdd3]',
  ON_HOLD:                   'bg-[#fef9ec] text-[#b07800] border-[#f0d870]',
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
  APPROVED: 'text-[#1a7f4b]',
  REJECTED: 'text-[#c0392b]',
  ON_HOLD:  'text-[#b07800]',
};

const inputCls =
  'w-full rounded-lg border border-hair px-3 py-2 text-sm focus:outline-none focus:border-2 focus:border-indigo-600';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-[#c0392b]">{message}</p>;
}

function DrawerSkeleton() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      <div className="h-5 w-32 bg-[#f2f2f7] rounded" />
      <div className="h-6 w-full bg-[#f2f2f7] rounded" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-16 bg-[#f2f2f7] rounded" />
            <div className="h-4 w-24 bg-[#f2f2f7] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-hair w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hair">
          <h2 className="text-base font-semibold text-ink">New Purchase Request</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <form
          onSubmit={handleSubmit(v => createMutation.mutateAsync(v))}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Item Specification <span className="text-[#c0392b]">*</span>
            </label>
            <input {...register('itemSpec')} type="text" placeholder="e.g. Laptop Dell XPS 15 i7"
              className={inputCls} />
            <FieldError message={errors.itemSpec?.message} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
                Quantity <span className="text-[#c0392b]">*</span>
              </label>
              <input {...register('quantity')} type="number" min={1} className={inputCls} />
              <FieldError message={errors.quantity?.message} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
                Est. Cost (₹) <span className="text-[#c0392b]">*</span>
              </label>
              <input {...register('estCost')} type="text" placeholder="0.00" className={inputCls} />
              <FieldError message={errors.estCost?.message} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Budget Code <span className="text-[#c0392b]">*</span>
            </label>
            <input {...register('budgetCode')} type="text" placeholder="e.g. IT-CAPEX-2026"
              className={inputCls} />
            <FieldError message={errors.budgetCode?.message} />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Linked Device Request ID{' '}
              <span className="normal-case text-ink-muted font-normal">(optional)</span>
            </label>
            <input {...register('deviceRequestId')} type="text" placeholder="cuid…"
              className={inputCls} />
          </div>

          {createMutation.isError && (
            <p className="text-xs text-[#c0392b]">Failed to create request. Please try again.</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={createMutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 disabled:opacity-50">
              {createMutation.isPending ? 'Creating…' : 'Submit for Approval'}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-hair w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hair">
          <h2 className="text-base font-semibold text-ink">Record Purchase Order</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit(v => mutation.mutateAsync(v))} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              PO Number <span className="text-[#c0392b]">*</span>
            </label>
            <input {...register('poNumber')} type="text" placeholder="PO-2026-XXXX"
              className={inputCls} />
            <FieldError message={errors.poNumber?.message} />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Vendor <span className="text-[#c0392b]">*</span>
            </label>
            <select {...register('vendorId')} className={`${inputCls} bg-white`}>
              <option value="">Select vendor…</option>
              {vendors.filter(v => v.active).map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.category})</option>
              ))}
            </select>
            <FieldError message={errors.vendorId?.message} />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
              Actual Cost (₹) <span className="text-[#c0392b]">*</span>
            </label>
            <input {...register('actualCost')} type="text" placeholder="0.00" className={inputCls} />
            <FieldError message={errors.actualCost?.message} />
          </div>

          {mutation.isError && <p className="text-xs text-[#c0392b]">Failed. Please try again.</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={mutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-hair w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hair">
          <h2 className="text-base font-semibold text-ink">Record Receipt</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="px-6 pt-3 pb-1">
          <p className="text-xs bg-[#fafafa] rounded-lg px-3 py-2 border border-hair text-ink-muted">
            Item: <span className="font-medium text-ink-soft">{itemSpec}</span>
          </p>
        </div>
        <form onSubmit={handleSubmit(v => mutation.mutateAsync(v))} className="px-6 pb-6 space-y-4 mt-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
                Device Type <span className="text-[#c0392b]">*</span>
              </label>
              <input {...register('type')} type="text" placeholder="e.g. Laptop"
                className={inputCls} />
              <FieldError message={errors.type?.message} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
                Make / Model
              </label>
              <input {...register('makeModel')} type="text" placeholder="e.g. Dell XPS 15"
                className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
                Serial Number <span className="text-[#c0392b]">*</span>
              </label>
              <input {...register('serialNumber')} type="text" placeholder="SN-XXXXXXX"
                className={inputCls} />
              <FieldError message={errors.serialNumber?.message} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-1.5">
                Condition
              </label>
              <input {...register('condition')} type="text" placeholder="e.g. New"
                className={inputCls} />
            </div>
          </div>

          {mutation.isError && <p className="text-xs text-[#c0392b]">Failed. Please try again.</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={mutation.isPending}
              className="px-5 py-2 rounded-lg bg-[#1a7f4b] text-white text-sm font-medium
                         hover:bg-[#166940] disabled:opacity-50">
              {mutation.isPending ? 'Registering…' : 'Confirm Receipt & Register Device'}
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
      <div className="relative w-full max-w-lg bg-white border-l border-hair flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hair sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-ink">Purchase Request</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl">×</button>
        </div>

        {isLoading && <DrawerSkeleton />}

        {pr && (
          <div className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-indigo-600 font-semibold">{pr.id}</p>
                <h3 className="text-lg font-semibold text-ink mt-0.5">{pr.itemSpec}</h3>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap
                ${STATUS_STYLES[pr.status] ?? 'bg-[#f2f2f7] text-[#6e6e73] border-hair'}`}>
                {STATUS_LABEL[pr.status] ?? pr.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Quantity',    String(pr.quantity)],
                ['Est. Cost',   `₹${pr.estCost}`],
                ['Actual Cost', pr.actualCost ? `₹${pr.actualCost}` : '—'],
                ['Budget Code', pr.budgetCode],
                ['PO Number',   pr.poNumber ?? '—'],
                ['Received',    formatDate(pr.receivedAt)],
                ['Raised by',   pr.raisedBy.name],
                ['Vendor',      pr.vendor?.name ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-ink-muted font-medium">{label}</p>
                  <p className="text-ink-soft font-medium">{value}</p>
                </div>
              ))}
            </div>

            {pr.deviceRequest && (
              <div className="rounded-lg bg-[#e0f0fe] border border-[#b6d8ff] px-4 py-3 text-xs">
                <p className="font-semibold text-indigo-700 mb-1">Linked Device Request</p>
                <p className="text-indigo-600">
                  {pr.deviceRequest.deviceType} — {pr.deviceRequest.requester.name}
                </p>
                <p className="text-indigo-400 font-mono mt-0.5">{pr.deviceRequest.id}</p>
              </div>
            )}

            {(pr.approvalSteps?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-2">
                  Approval Trail
                </p>
                <div className="space-y-2">
                  {pr.approvalSteps!.map(step => (
                    <div key={step.id} className="flex items-start gap-3 text-xs">
                      <div className={`mt-0.5 font-semibold ${DECISION_STYLES[step.decision] ?? 'text-ink-soft'}`}>
                        {step.decision}
                      </div>
                      <div className="flex-1">
                        <span className="text-ink-soft font-medium">{step.approver.name}</span>
                        <span className="text-ink-muted mx-1">·</span>
                        <span className="text-ink-muted">{step.role}</span>
                        <span className="text-ink-muted mx-1">·</span>
                        <span className="text-ink-muted">{formatDate(step.decidedAt)}</span>
                        {step.comment && (
                          <p className="text-ink-muted mt-0.5 italic">"{step.comment}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              {pr.status === 'FINANCE_APPROVED' && (
                <button onClick={onPo}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                             hover:bg-indigo-700">
                  Record PO
                </button>
              )}
              {pr.status === 'PO_RAISED' && (
                <button onClick={onReceive}
                  className="px-4 py-2 rounded-lg bg-[#1a7f4b] text-white text-sm font-medium
                             hover:bg-[#166940]">
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

export default function PurchaseRequestsPage() {
  const [showNew, setShowNew] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [poId, setPoId] = useState<string | null>(null);
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [receiveItemSpec, setReceiveItemSpec] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data: prs = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['purchase-requests'],
    queryFn: () =>
      api.get<{ data: PurchaseRequest[] }>('/purchase-requests', { params: { limit: 100 } })
        .then(r => r.data.data),
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
          <h1 className="text-[22px] font-semibold text-ink">Purchase Requests</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {prs.length} total · {counts['PENDING_MANAGER_APPROVAL'] ?? 0} pending manager ·{' '}
            {counts['PENDING_FINANCE_APPROVAL'] ?? 0} pending finance
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          + New Request
        </button>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            filterStatus === ''
              ? 'bg-ink text-white border-ink'
              : 'text-ink-muted border-hair hover:bg-[#fafafa]'
          }`}
        >
          All ({prs.length})
        </button>
        {Object.entries(STATUS_LABEL).filter(([k]) => (counts[k] ?? 0) > 0).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key === filterStatus ? '' : key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              filterStatus === key
                ? `${STATUS_STYLES[key] ?? ''}`
                : 'text-ink-muted border-hair hover:bg-[#fafafa]'
            }`}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      {isLoading && <TableSkeleton />}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-hair gap-3">
          <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm font-medium text-ink-muted">No purchase requests</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-hair overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-hair">
                {['Ref', 'Item', 'Qty', 'Est. Cost', 'Budget Code', 'Vendor', 'Status', 'Raised', ''].map(h => (
                  <th key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                               uppercase tracking-[0.06em] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f2f7]">
              {filtered.map(pr => (
                <tr
                  key={pr.id}
                  className="hover:bg-[#fafafa] cursor-pointer"
                  onClick={() => setDetailId(pr.id)}
                >
                  <td className="px-4 py-3.5 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
                    {pr.id}
                  </td>
                  <td className="px-4 py-3.5 max-w-xs">
                    <span className="font-medium text-ink line-clamp-1">{pr.itemSpec}</span>
                    {pr.deviceRequest && (
                      <span className="text-xs text-indigo-600 block">
                        ↳ {pr.deviceRequest.deviceType} request
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft text-center tabular-nums">{pr.quantity}</td>
                  <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap">₹{pr.estCost}</td>
                  <td className="px-4 py-3.5 text-ink-muted text-xs font-mono">{pr.budgetCode}</td>
                  <td className="px-4 py-3.5 text-ink-muted text-xs">{pr.vendor?.name ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border
                      ${STATUS_STYLES[pr.status] ?? 'bg-[#f2f2f7] text-[#6e6e73] border-hair'}`}>
                      {STATUS_LABEL[pr.status] ?? pr.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                    {formatDate(pr.createdAt)}
                  </td>
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1.5">
                      {pr.status === 'FINANCE_APPROVED' && (
                        <button
                          onClick={() => setPoId(pr.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap
                                     bg-[#e0f0fe] border border-[#b6d8ff] text-indigo-600
                                     hover:bg-[#cce5fc]"
                        >
                          PO
                        </button>
                      )}
                      {pr.status === 'PO_RAISED' && (
                        <button
                          onClick={() => { setReceiveId(pr.id); setReceiveItemSpec(pr.itemSpec); }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap
                                     bg-[#eafaf3] border border-[#a3d9b8] text-[#1a7f4b]
                                     hover:bg-[#d6f4e7]"
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
        </div>
      )}

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
