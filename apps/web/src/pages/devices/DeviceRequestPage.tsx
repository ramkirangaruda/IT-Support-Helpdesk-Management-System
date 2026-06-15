import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

const DEVICE_TYPES = [
  { value: 'Laptop',   label: 'Laptop' },
  { value: 'Monitor',  label: 'Monitor' },
  { value: 'Keyboard', label: 'Keyboard' },
  { value: 'Mouse',    label: 'Mouse' },
  { value: 'Headset',  label: 'Headset' },
  { value: 'Phone',    label: 'Phone' },
  { value: 'Other',    label: 'Other' },
];

const schema = z.object({
  deviceType:   z.string().min(1, 'Please select a device type'),
  justification: z.string()
    .min(30, 'Justification must be at least 30 characters')
    .max(1000),
});

type FormValues = z.infer<typeof schema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

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

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post<{ id: string }>('/device-requests', values).then(r => r.data),
    onSuccess: (data) => setRequestId(data.id),
  });

  if (requestId) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto pt-10">
          <div className="bg-white rounded-xl border border-green-200 p-8 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Request Submitted</h2>
            <p className="text-sm text-gray-500 mb-4">
              Your device request has been sent for manager approval.
            </p>
            <p className="text-xs font-mono text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2 inline-block mb-6">
              {requestId}
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                to="/devices/my-requests"
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                           hover:bg-indigo-700 transition-colors"
              >
                View My Requests
              </Link>
              <button
                onClick={() => setRequestId(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                           hover:bg-gray-50 transition-colors"
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
        <Link to="/devices/my-requests" className="text-sm text-indigo-600 hover:underline">
          ← My Device Requests
        </Link>
      </div>

      <div className="max-w-xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Request a Device</h1>
        <p className="text-sm text-gray-500 mb-6">
          Submit a device request — your manager will be asked to approve it.
        </p>

        <form
          onSubmit={handleSubmit(values => createMutation.mutateAsync(values))}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
        >
          {/* Device type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device Type <span className="text-red-500">*</span>
            </label>
            <select
              {...register('deviceType')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Select device type…</option>
              {DEVICE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <FieldError message={errors.deviceType?.message} />
          </div>

          {/* Business justification */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Justification <span className="text-red-500">*</span>
            </label>
            <textarea
              {...register('justification')}
              rows={5}
              placeholder="Explain why you need this device and how it will be used…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
            />
            <div className="flex items-center justify-between mt-1">
              <FieldError message={errors.justification?.message} />
              <span className={`text-xs ml-auto ${
                (justification?.length ?? 0) < 30 ? 'text-amber-600' : 'text-gray-400'
              }`}>
                {justification?.length ?? 0}/1000
              </span>
            </div>
          </div>

          {createMutation.isError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              Failed to submit request. Please try again.
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isSubmitting || createMutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Submitting…' : 'Submit Request'}
            </button>
            <Link
              to="/devices/my-requests"
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                         hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}
