import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface DeviceTypeOption {
  type: string;
  availableCount: number;
}

const schema = z.object({
  deviceType:   z.string().min(1, 'Please select a device type'),
  justification: z.string()
    .min(30, 'Justification must be at least 30 characters')
    .max(1000),
});

type FormValues = z.infer<typeof schema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-[#c0392b]">{message}</p>;
}

const inputCls = `w-full rounded-lg border border-hair px-3 py-2 text-sm text-ink bg-white
                  focus:outline-none focus:border-2 focus:border-indigo-600`;

export default function DeviceRequestPage() {
  const [requestId, setRequestId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { deviceType: '', justification: '' },
  });

  const justification = watch('justification');

  const { data: deviceTypes = [], isLoading: typesLoading } = useQuery<DeviceTypeOption[]>({
    queryKey: ['device-types'],
    queryFn:  () => api.get<DeviceTypeOption[]>('/devices/types').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post<{ id: string }>('/device-requests', values).then(r => r.data),
    onSuccess: (data) => setRequestId(data.id),
  });

  if (requestId) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto pt-10">
          <div className="bg-white rounded-xl border border-[#a3d9b8] p-8 text-center">
            <div className="w-12 h-12 bg-[#eafaf3] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#1a7f4b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-[22px] font-semibold text-ink mb-2">Request Submitted</h2>
            <p className="text-sm text-ink-muted mb-4">
              Your device request has been sent for manager approval.
            </p>
            <span className="ticket-id inline-block mb-6">{requestId}</span>
            <div className="flex gap-3 justify-center">
              <Link
                to="/devices/my-requests"
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                View My Requests
              </Link>
              <button
                onClick={() => setRequestId(null)}
                className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]"
              >
                Submit Another
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <Link to="/devices/my-requests" className="text-sm text-ink-muted hover:text-indigo-600">
          ← My Device Requests
        </Link>
      </div>

      <div className="max-w-xl">
        <h1 className="text-[22px] font-semibold text-ink mb-1">Request a Device</h1>
        <p className="text-sm text-ink-muted mb-6">
          Submit a device request — your manager will be asked to approve it.
        </p>

        <form
          onSubmit={handleSubmit(values => createMutation.mutateAsync(values))}
          className="bg-white rounded-xl border border-hair p-6 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              Device Type <span className="text-[#c0392b]">*</span>
            </label>
            <select {...register('deviceType')} className={inputCls} disabled={typesLoading}>
              <option value="">{typesLoading ? 'Loading device types…' : 'Select device type…'}</option>
              {deviceTypes.map(t => (
                <option key={t.type} value={t.type}>
                  {t.type}{t.availableCount > 0 ? ` (${t.availableCount} in stock)` : ' (none in stock — will be ordered)'}
                </option>
              ))}
              <option value="Other">Other (not in current inventory)</option>
            </select>
            <FieldError message={errors.deviceType?.message} />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              Business Justification <span className="text-[#c0392b]">*</span>
            </label>
            <textarea
              {...register('justification')}
              rows={5}
              placeholder="Explain why you need this device and how it will be used…"
              className={`${inputCls} resize-y`}
            />
            <div className="flex items-center justify-between mt-1">
              <FieldError message={errors.justification?.message} />
              <span className={`text-xs ml-auto ${
                (justification?.length ?? 0) < 30 ? 'text-[#b07800]' : 'text-ink-muted'
              }`}>
                {justification?.length ?? 0}/1000
              </span>
            </div>
          </div>

          {createMutation.isError && (
            <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-4 py-3 text-sm text-[#c0392b]">
              Failed to submit request. Please try again.
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isSubmitting || createMutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Submitting…' : 'Submit Request'}
            </button>
            <Link
              to="/devices/my-requests"
              className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}
