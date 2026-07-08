import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../../api/api';
import Pagination, { type Paginated } from '../../components/Pagination';
import Layout from '../../components/Layout';

interface Device {
  id: string;
  type: string;
  makeModel: string | null;
  serialNumber: string;
  status: string;
  condition: string | null;
  purchasedOn: string | null;
  cost: string | null;
  allocations: Array<{
    id: string;
    returnedOn: string | null;
    employee: { id: string; name: string; email: string };
    request: { id: string } | null;
  }>;
}

const createSchema = z.object({
  type:         z.string().min(1, 'Required'),
  makeModel:    z.string().optional(),
  serialNumber: z.string().min(1, 'Required'),
  condition:    z.string().optional(),
  purchasedOn:  z.string().optional(),
  cost:         z.string().optional(),
});
type CreateFormValues = z.infer<typeof createSchema>;

const returnSchema = z.object({
  condition: z.string().optional(),
  notes:     z.string().optional(),
});
type ReturnFormValues = z.infer<typeof returnSchema>;

const DEVICE_TYPES = ['Laptop', 'Monitor', 'Keyboard', 'Mouse', 'Headset', 'Phone', 'Other'];

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: 'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]',
  ALLOCATED: 'bg-[#e0f0fe] text-[#0071e3] border-[#b6d8ff]',
  IN_REPAIR: 'bg-[#fef9ec] text-[#b07800] border-[#f0d870]',
  RETIRED:   'bg-[#f2f2f7] text-[#6e6e73] border-hair',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-[#c0392b]">{message}</p>;
}

const inputCls = `w-full rounded-lg border border-hair px-3 py-2 text-sm text-ink bg-white
                  focus:outline-none focus:border-2 focus:border-indigo-600`;

// ── Add Device Modal ──────────────────────────────────────────────────────────

function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateFormValues) =>
      api.post('/devices', {
        ...values,
        cost: values.cost ? parseFloat(values.cost) : undefined,
        purchasedOn: values.purchasedOn || undefined,
      }).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-hair w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hair">
          <h2 className="text-base font-semibold text-ink">Add Device</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">×</button>
        </div>

        <form
          onSubmit={handleSubmit(values => createMutation.mutateAsync(values))}
          className="p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">
                Type <span className="text-[#c0392b]">*</span>
              </label>
              <select {...register('type')} className={inputCls}>
                <option value="">Select…</option>
                {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <FieldError message={errors.type?.message} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Make / Model</label>
              <input {...register('makeModel')} type="text" placeholder="e.g. Dell XPS 15" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">
                Serial Number <span className="text-[#c0392b]">*</span>
              </label>
              <input {...register('serialNumber')} type="text" placeholder="SN-XXXXXXXX" className={inputCls} />
              <FieldError message={errors.serialNumber?.message} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Condition</label>
              <input {...register('condition')} type="text" placeholder="e.g. New, Good, Fair" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Purchase Date</label>
              <input {...register('purchasedOn')} type="date" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Cost (₹)</label>
              <input {...register('cost')} type="number" step="0.01" min="0" placeholder="0.00" className={inputCls} />
            </div>
          </div>

          {createMutation.isError && (
            <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-3 py-2">
              <p className="text-xs text-[#c0392b]">Failed to add device. Please try again.</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Adding…' : 'Add Device'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Record Return Modal ───────────────────────────────────────────────────────

function RecordReturnModal({ device, onClose }: { device: Device; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit } = useForm<ReturnFormValues>({ resolver: zodResolver(returnSchema) });

  const returnMutation = useMutation({
    mutationFn: (values: ReturnFormValues) =>
      api.post(`/devices/${device.id}/return`, values).then(r => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      onClose();
    },
  });

  const allocation = device.allocations.find(a => !a.returnedOn);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-hair w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-hair">
          <h2 className="text-base font-semibold text-ink">Record Device Return</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">×</button>
        </div>

        <div className="px-6 pt-4 pb-2">
          <div className="rounded-lg bg-[#fafafa] border border-hair px-4 py-3 text-sm mb-4">
            <p className="font-semibold text-ink font-mono text-xs">{device.id}</p>
            {device.makeModel && <p className="text-ink-muted text-xs">{device.makeModel}</p>}
            {allocation && (
              <p className="text-ink-muted text-xs mt-1">
                Held by: <span className="text-ink font-medium">{allocation.employee.name}</span>
                {' '}&lt;{allocation.employee.email}&gt;
              </p>
            )}
          </div>
        </div>

        <form
          onSubmit={handleSubmit(values => returnMutation.mutateAsync(values))}
          className="px-6 pb-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Condition on Return</label>
            <input
              {...register('condition')}
              type="text"
              placeholder="e.g. Good, Minor scratches"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Notes (optional)</label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Any notes about the return…"
              className={`${inputCls} resize-none`}
            />
          </div>

          {returnMutation.isError && (
            <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-3 py-2">
              <p className="text-xs text-[#c0392b]">Failed to record return. Please try again.</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={returnMutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 disabled:opacity-50"
            >
              {returnMutation.isPending ? 'Recording…' : 'Confirm Return'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Table Row Skeleton ────────────────────────────────────────────────────────

function TableRowSkeleton() {
  return (
    <tr className="border-b border-[#f2f2f7] animate-pulse">
      {[16, 12, 20, 16, 12, 10, 14, 14, 10].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className={`h-4 bg-[#f2f2f7] rounded w-${w}`} />
        </td>
      ))}
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DeviceRegisterPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [returningDevice, setReturningDevice] = useState<Device | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);

  const { data: res, isLoading } = useQuery<Paginated<Device>>({
    queryKey: ['devices', page, filterStatus, filterType],
    queryFn: () => api.get<Paginated<Device>>('/devices', {
      params: { page, limit: 20, ...(filterStatus && { status: filterStatus }), ...(filterType && { type: filterType }) },
    }).then(r => r.data),
  });

  const queryClient = useQueryClient();

  const retireMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/devices/${id}`, { status: 'RETIRED' }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });

  const filtered = res?.data ?? [];

  const selectCls = `rounded-lg border border-hair px-3 py-2 text-sm bg-white text-ink
                     focus:outline-none focus:border-2 focus:border-indigo-600`;

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Device Register</h1>
          <p className="text-sm text-ink-muted mt-0.5">All IT assets in the organisation</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          + Add Device
        </button>
      </div>

      <div className="flex gap-3 mb-4 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className={selectCls}
        >
          <option value="">All Statuses</option>
          <option value="AVAILABLE">Available</option>
          <option value="ALLOCATED">Allocated</option>
          <option value="IN_REPAIR">In Repair</option>
          <option value="RETIRED">Retired</option>
        </select>

        <select
          value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(1); }}
          className={selectCls}
        >
          <option value="">All Types</option>
          {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <span className="ml-auto text-xs text-ink-muted">
          {res?.total ?? 0} device{(res?.total ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-hair overflow-hidden">
        {!isLoading && filtered.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-ink-muted gap-2">
            <p className="text-sm font-medium">No devices found</p>
          </div>
        )}

        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-hair">
              {['Device ID', 'Type', 'Make / Model', 'Serial No.', 'Status', 'Condition', 'Purchased', 'Holder', 'Actions'].map(h => (
                <th key={h}
                  className="px-4 py-3 text-left text-[11px] font-medium text-ink-muted
                             uppercase tracking-[0.06em] whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f2f2f7]">
            {isLoading && Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} />)}

            {!isLoading && filtered.map(device => {
              const activeAlloc = device.allocations.find(a => !a.returnedOn);
              return (
                <tr key={device.id} className="hover:bg-[#fafafa]">
                  <td className="px-4 py-3.5 font-mono text-xs text-indigo-600 font-medium whitespace-nowrap">
                    {device.id}
                  </td>
                  <td className="px-4 py-3.5 text-ink">{device.type}</td>
                  <td className="px-4 py-3.5 text-ink-muted text-xs">{device.makeModel ?? '—'}</td>
                  <td className="px-4 py-3.5 font-mono text-xs text-ink-muted">{device.serialNumber}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
                      ${STATUS_STYLES[device.status] ?? 'bg-[#f2f2f7] text-[#6e6e73] border-hair'}`}>
                      {device.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-ink-muted text-xs">{device.condition ?? '—'}</td>
                  <td className="px-4 py-3.5 text-ink-muted text-xs whitespace-nowrap">
                    {formatDate(device.purchasedOn)}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink-soft">
                    {activeAlloc
                      ? <span title={activeAlloc.employee.email}>{activeAlloc.employee.name}</span>
                      : <span className="text-ink-muted italic">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      {device.status === 'ALLOCATED' && (
                        <button
                          onClick={() => setReturningDevice(device)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium
                                     bg-[#fef9ec] border border-[#f0d870] text-[#b07800]
                                     hover:bg-[#fef3d0]"
                        >
                          Return
                        </button>
                      )}
                      {device.status !== 'RETIRED' && device.status !== 'ALLOCATED' && (
                        <button
                          onClick={() => {
                            if (confirm(`Retire ${device.id}? This cannot be undone.`)) {
                              retireMutation.mutate(device.id);
                            }
                          }}
                          disabled={retireMutation.isPending}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium
                                     bg-[#fff1f2] border border-[#fecdd3] text-[#c0392b]
                                     hover:bg-[#ffe4e6] disabled:opacity-40"
                        >
                          Retire
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {res && (
        <Pagination page={res.page} totalPages={res.totalPages} total={res.total} onPageChange={setPage} />
      )}

      {showAdd && <AddDeviceModal onClose={() => setShowAdd(false)} />}
      {returningDevice && (
        <RecordReturnModal device={returningDevice} onClose={() => setReturningDevice(null)} />
      )}
    </Layout>
  );
}
