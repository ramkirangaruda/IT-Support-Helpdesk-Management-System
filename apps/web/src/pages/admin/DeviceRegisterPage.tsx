import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../../api/api';
import Layout from '../../components/Layout';

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Schemas ───────────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const DEVICE_TYPES = ['Laptop', 'Monitor', 'Keyboard', 'Mouse', 'Headset', 'Phone', 'Other'];

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE:  'bg-green-50 text-green-700 border-green-200',
  ALLOCATED:  'bg-blue-50 text-blue-700 border-blue-200',
  IN_REPAIR:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  RETIRED:    'bg-gray-100 text-gray-500 border-gray-200',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

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
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add Device</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form
          onSubmit={handleSubmit(values => createMutation.mutateAsync(values))}
          className="p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                {...register('type')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select…</option>
                {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <FieldError message={errors.type?.message} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Make / Model</label>
              <input
                {...register('makeModel')}
                type="text"
                placeholder="e.g. Dell XPS 15"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Serial Number <span className="text-red-500">*</span>
              </label>
              <input
                {...register('serialNumber')}
                type="text"
                placeholder="SN-XXXXXXXX"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <FieldError message={errors.serialNumber?.message} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
              <input
                {...register('condition')}
                type="text"
                placeholder="e.g. New, Good, Fair"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Purchase Date</label>
              <input
                {...register('purchasedOn')}
                type="date"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cost (£)</label>
              <input
                {...register('cost')}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {createMutation.isError && (
            <p className="text-xs text-red-600">Failed to add device. Please try again.</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? 'Adding…' : 'Add Device'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                         hover:bg-gray-50 transition-colors"
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
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      onClose();
    },
  });

  const allocation = device.allocations.find(a => !a.returnedOn);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Record Device Return</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 pt-4 pb-2">
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-sm mb-4">
            <p className="font-semibold text-gray-800">{device.id}</p>
            {device.makeModel && <p className="text-gray-500 text-xs">{device.makeModel}</p>}
            {allocation && (
              <p className="text-gray-500 text-xs mt-1">
                Held by: <span className="text-gray-700 font-medium">{allocation.employee.name}</span>
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Condition on Return</label>
            <input
              {...register('condition')}
              type="text"
              placeholder="e.g. Good, Minor scratches"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Any notes about the return…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {returnMutation.isError && (
            <p className="text-xs text-red-600">Failed to record return. Please try again.</p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={returnMutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {returnMutation.isPending ? 'Recording…' : 'Confirm Return'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                         hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DeviceRegisterPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [returningDevice, setReturningDevice] = useState<Device | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: () => api.get<Device[]>('/devices').then(r => r.data),
  });

  const queryClient = useQueryClient();

  const retireMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/devices/${id}`, { status: 'RETIRED' }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });

  const filtered = devices.filter(d => {
    if (filterStatus && d.status !== filterStatus) return false;
    if (filterType && d.type !== filterType) return false;
    return true;
  });

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Device Register</h1>
          <p className="text-sm text-gray-500 mt-0.5">All IT assets in the organisation</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                     hover:bg-indigo-700 transition-colors"
        >
          + Add Device
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="AVAILABLE">Available</option>
          <option value="ALLOCATED">Allocated</option>
          <option value="IN_REPAIR">In Repair</option>
          <option value="RETIRED">Retired</option>
        </select>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Types</option>
          {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <span className="ml-auto text-xs text-gray-400 self-center">
          {filtered.length} device{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm font-medium">No devices found</p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Device ID', 'Type', 'Make / Model', 'Serial No.', 'Status', 'Condition', 'Purchased', 'Holder', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(device => {
                const activeAlloc = device.allocations.find(a => !a.returnedOn);
                return (
                  <tr key={device.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold whitespace-nowrap">
                      {device.id}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{device.type}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{device.makeModel ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{device.serialNumber}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLES[device.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {device.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{device.condition ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(device.purchasedOn)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {activeAlloc ? (
                        <span title={activeAlloc.employee.email}>{activeAlloc.employee.name}</span>
                      ) : (
                        <span className="text-gray-300 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {device.status === 'ALLOCATED' && (
                          <button
                            onClick={() => setReturningDevice(device)}
                            className="px-2.5 py-1 rounded text-xs font-medium bg-amber-50
                                       border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
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
                            className="px-2.5 py-1 rounded text-xs font-medium bg-red-50
                                       border border-red-200 text-red-700 hover:bg-red-100 transition-colors
                                       disabled:opacity-40"
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
        )}
      </div>

      {showAdd && <AddDeviceModal onClose={() => setShowAdd(false)} />}
      {returningDevice && (
        <RecordReturnModal device={returningDevice} onClose={() => setReturningDevice(null)} />
      )}
    </Layout>
  );
}
