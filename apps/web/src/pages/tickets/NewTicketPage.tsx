import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface Category {
  id: string;
  name: string;
}

const schema = z.object({
  subject: z.string().min(5, 'Subject must be at least 5 characters').max(150),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  categoryId: z.string().min(1, 'Please select a category'),
});

type FormValues = z.infer<typeof schema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

export default function NewTicketPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);

  const { data: categories = [], isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories').then(r => r.data),
    staleTime: Infinity,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM' },
  });

  const createMutation = useMutation({
    // source is always FORM for portal submissions; file storage is Phase 4
    mutationFn: (values: FormValues) =>
      api.post<{ id: string }>('/tickets', { ...values, source: 'FORM' }).then(r => r.data),
    onSuccess: (ticket) => navigate(`/tickets/${ticket.id}`),
  });

  return (
    <Layout>
      <div className="mb-6">
        <Link to="/tickets" className="text-sm text-indigo-600 hover:underline">
          ← Back to tickets
        </Link>
      </div>

      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">New Ticket</h1>
        <p className="text-sm text-gray-500 mb-6">Submit a new IT support request</p>

        <form
          onSubmit={handleSubmit(values => createMutation.mutateAsync(values))}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
        >
          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              {...register('subject')}
              type="text"
              placeholder="Brief description of the issue"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <FieldError message={errors.subject?.message} />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              {...register('description')}
              rows={5}
              placeholder="Provide as much detail as possible…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
            />
            <FieldError message={errors.description?.message} />
          </div>

          {/* Category + Priority row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                {...register('categoryId')}
                disabled={catsLoading}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                           disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">
                  {catsLoading ? 'Loading…' : 'Select category'}
                </option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <FieldError message={errors.categoryId?.message} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority <span className="text-red-500">*</span>
              </label>
              <select
                {...register('priority')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
              <FieldError message={errors.priority?.message} />
            </div>
          </div>

          {/* Attachments — stored in Phase 4 (MinIO/S3); collected here for future use */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Attachments <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.log"
              onChange={e => setFileNames(Array.from(e.target.files ?? []).map(f => f.name))}
              className="block w-full text-sm text-gray-500
                         file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0
                         file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700
                         hover:file:bg-indigo-100 cursor-pointer"
            />
            {fileNames.length > 0 && (
              <p className="mt-1 text-xs text-amber-600">
                {fileNames.length} file{fileNames.length > 1 ? 's' : ''} selected — attachment upload available in a future release.
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              Max 10 MB per file. Images, PDF, Word, text accepted.
            </p>
          </div>

          {/* Submit error */}
          {createMutation.isError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              Failed to submit ticket. Please try again.
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isSubmitting || createMutation.isPending}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Submitting…' : 'Submit Ticket'}
            </button>
            <Link
              to="/tickets"
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
