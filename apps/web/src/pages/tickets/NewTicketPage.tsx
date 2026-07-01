import { useRef, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface Category { id: string; name: string }

interface KBSuggestion {
  id:       string;
  title:    string;
  category: { id: string; name: string } | null;
}

interface KBListResponse { data: KBSuggestion[]; total: number }

const schema = z.object({
  subject:     z.string().min(5, 'Subject must be at least 5 characters').max(150),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  categoryId:  z.string().min(1, 'Please select a category'),
});

type FormValues = z.infer<typeof schema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-[#c0392b]">{message}</p>;
}

export default function NewTicketPage() {
  const navigate     = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [kbQuery,   setKbQuery]   = useState('');

  const { data: categories = [], isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn:  () => api.get<Category[]>('/categories').then(r => r.data),
    staleTime: Infinity,
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM' },
  });

  const descriptionValue = watch('description');
  useEffect(() => {
    if (!descriptionValue || descriptionValue.length < 20) { setKbQuery(''); return; }
    const timer = setTimeout(() => setKbQuery(descriptionValue.slice(0, 50).trim()), 700);
    return () => clearTimeout(timer);
  }, [descriptionValue]);

  const { data: kbResults } = useQuery<KBListResponse>({
    queryKey: ['kb-suggestions', kbQuery],
    queryFn:  () =>
      api.get<KBListResponse>('/kb/articles', { params: { q: kbQuery, limit: 3 } }).then(r => r.data),
    enabled: kbQuery.length >= 10,
    staleTime: 60_000,
  });

  const suggestions = kbResults?.data?.slice(0, 3) ?? [];

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post<{ id: string }>('/tickets', { ...values, source: 'FORM' }).then(r => r.data),
    onSuccess: (ticket) => navigate(`/tickets/${ticket.id}`),
  });

  const inputCls = `w-full rounded-lg border border-hair px-3 py-2 text-sm text-ink bg-white
                    focus:outline-none focus:border-2 focus:border-indigo-600
                    placeholder:text-ink-muted`;

  return (
    <Layout>
      <div className="mb-6">
        <Link to="/tickets" className="text-sm text-ink-muted hover:text-indigo-600">
          ← Back to tickets
        </Link>
      </div>

      <div className="max-w-2xl">
        <h1 className="text-[22px] font-semibold text-ink mb-0.5">New Ticket</h1>
        <p className="text-sm text-ink-muted mb-6">Submit a new IT support request</p>

        <form
          onSubmit={handleSubmit(values => createMutation.mutateAsync(values))}
          className="bg-white rounded-xl border border-hair p-6 space-y-5"
        >
          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              Subject <span className="text-[#c0392b]">*</span>
            </label>
            <input
              {...register('subject')}
              type="text"
              placeholder="Brief description of the issue"
              className={inputCls}
            />
            <FieldError message={errors.subject?.message} />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              Description <span className="text-[#c0392b]">*</span>
            </label>
            <textarea
              {...register('description')}
              rows={5}
              placeholder="Provide as much detail as possible…"
              className={`${inputCls} resize-y`}
            />
            <FieldError message={errors.description?.message} />
          </div>

          {/* KB suggestions */}
          {suggestions.length > 0 && (
            <div className="rounded-lg bg-[#e0f0fe] border border-[#b6d8ff] p-4">
              <p className="text-sm font-semibold text-indigo-700 mb-2">
                Before submitting — did you check these articles?
              </p>
              <ul className="space-y-1.5 mb-2">
                {suggestions.map(article => (
                  <li key={article.id} className="flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5 shrink-0 text-xs">›</span>
                    <Link
                      to={`/kb/${article.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-700 hover:underline leading-snug"
                    >
                      {article.title}
                      {article.category && (
                        <span className="text-indigo-400 font-normal ml-1.5">
                          — {article.category.name}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-indigo-600">
                You can still submit your ticket if these articles don't solve your problem.
              </p>
            </div>
          )}

          {/* Category + Priority row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">
                Category <span className="text-[#c0392b]">*</span>
              </label>
              <select
                {...register('categoryId')}
                disabled={catsLoading}
                className={`${inputCls} disabled:bg-[#f2f2f7] disabled:text-ink-muted`}
              >
                <option value="">{catsLoading ? 'Loading…' : 'Select category'}</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <FieldError message={errors.categoryId?.message} />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">
                Priority <span className="text-[#c0392b]">*</span>
              </label>
              <select {...register('priority')} className={inputCls}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
              <FieldError message={errors.priority?.message} />
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">
              Attachments <span className="text-ink-muted font-normal">(optional)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.log"
              onChange={e => setFileNames(Array.from(e.target.files ?? []).map(f => f.name))}
              className="block w-full text-sm text-ink-muted
                         file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0
                         file:text-sm file:font-medium file:bg-[#e0f0fe] file:text-indigo-600
                         hover:file:bg-[#d0e8fd] cursor-pointer"
            />
            {fileNames.length > 0 && (
              <p className="mt-1 text-xs text-[#b07800]">
                {fileNames.length} file{fileNames.length > 1 ? 's' : ''} selected — attachment upload available in a future release.
              </p>
            )}
            <p className="mt-1 text-xs text-ink-muted">
              Max 10 MB per file. Images, PDF, Word, text accepted.
            </p>
          </div>

          {/* Submit error */}
          {createMutation.isError && (
            <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-4 py-3 text-sm text-[#c0392b]">
              Failed to submit ticket. Please try again.
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isSubmitting || createMutation.isPending}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Submitting…' : 'Submit Ticket'}
            </button>
            <Link
              to="/tickets"
              className="px-4 py-2.5 rounded-lg border border-hair text-sm text-ink-soft
                         hover:bg-[#fafafa]"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}
