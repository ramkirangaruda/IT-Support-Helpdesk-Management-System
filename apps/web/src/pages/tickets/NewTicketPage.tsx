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

const MAX_FILE_SIZE  = 5 * 1024 * 1024; // 5 MB
const MAX_FILE_COUNT = 5;
const ALLOWED_TYPES  = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']);

function formatBytes(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface SelectedFile {
  file:  File;
  error: string | null;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return `Not allowed (${file.type || 'unknown type'}). Accepted: JPEG, PNG, GIF, WEBP, PDF.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `Too large (${formatBytes(file.size)}). Max 5 MB per file.`;
  }
  return null;
}

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

// File type icon — simple SVG
function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === 'application/pdf') {
    return (
      <svg className="w-5 h-5 text-[#c0392b] shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-indigo-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
    </svg>
  );
}

export default function NewTicketPage() {
  const navigate     = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError,    setUploadError]    = useState<string | null>(null);
  const [kbQuery, setKbQuery] = useState('');

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
    onSuccess: async (ticket) => {
      const validFiles = selectedFiles.filter(sf => !sf.error).map(sf => sf.file);
      if (validFiles.length > 0) {
        const formData = new FormData();
        validFiles.forEach(f => formData.append('files', f));
        try {
          setUploadProgress(0);
          await api.post(`/tickets/${ticket.id}/attachments`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
              if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
            },
          });
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setUploadError(msg ?? 'File upload failed. Your ticket was created but attachments were not saved.');
          setUploadProgress(null);
          // Still navigate — the ticket was created
          navigate(`/tickets/${ticket.id}`);
          return;
        }
      }
      navigate(`/tickets/${ticket.id}`);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    const combined = [...selectedFiles, ...incoming.map(file => ({ file, error: validateFile(file) }))];
    // Enforce max count — keep the first MAX_FILE_COUNT
    setSelectedFiles(combined.slice(0, MAX_FILE_COUNT));
    // Reset the input so the same file can be re-added after removal
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(idx: number) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  }

  const hasInvalidFiles = selectedFiles.some(sf => sf.error);
  const isPending = isSubmitting || createMutation.isPending;

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

            {/* File picker — hidden when max count reached */}
            {selectedFiles.length < MAX_FILE_COUNT && (
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                onChange={handleFileChange}
                className="block w-full text-sm text-ink-muted
                           file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0
                           file:text-sm file:font-medium file:bg-[#e0f0fe] file:text-indigo-600
                           hover:file:bg-[#d0e8fd] cursor-pointer"
              />
            )}

            <p className="mt-1 text-xs text-ink-muted">
              Max {MAX_FILE_COUNT} files · 5 MB each · JPEG, PNG, GIF, WEBP, PDF
            </p>

            {/* Selected file list */}
            {selectedFiles.length > 0 && (
              <ul className="mt-3 space-y-2">
                {selectedFiles.map((sf, idx) => (
                  <li
                    key={idx}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm
                                ${sf.error
                                  ? 'border-[#fecdd3] bg-[#fff1f2]'
                                  : 'border-hair bg-[#fafafa]'}`}
                  >
                    <FileIcon mimeType={sf.file.type} />
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${sf.error ? 'text-[#c0392b]' : 'text-ink'}`}>
                        {sf.file.name}
                      </p>
                      {sf.error ? (
                        <p className="text-xs text-[#c0392b] mt-0.5">{sf.error}</p>
                      ) : (
                        <p className="text-xs text-ink-muted mt-0.5">{formatBytes(sf.file.size)}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="shrink-0 text-ink-muted hover:text-[#c0392b] p-0.5 rounded"
                      aria-label={`Remove ${sf.file.name}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Upload progress */}
            {uploadProgress !== null && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-ink-muted">Uploading attachments…</span>
                  <span className="text-xs text-ink-muted">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-[#f2f2f7] rounded-full h-1.5">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Upload error (post-ticket-create) */}
            {uploadError && (
              <p className="mt-2 text-xs text-[#c0392b]">{uploadError}</p>
            )}
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
              disabled={isPending || hasInvalidFiles}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Submitting…' : 'Submit Ticket'}
            </button>
            <Link
              to="/tickets"
              className="px-4 py-2.5 rounded-lg border border-hair text-sm text-ink-soft
                         hover:bg-[#fafafa]"
            >
              Cancel
            </Link>
            {hasInvalidFiles && (
              <p className="text-xs text-[#c0392b]">
                Fix the file errors above before submitting.
              </p>
            )}
          </div>
        </form>
      </div>
    </Layout>
  );
}
