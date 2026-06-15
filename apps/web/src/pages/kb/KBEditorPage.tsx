import { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';

interface Category { id: string; name: string }

const schema = z.object({
  title:      z.string().min(3, 'Title must be at least 3 characters').max(200),
  body:       z.string().min(20, 'Body must be at least 20 characters'),
  categoryId: z.string().optional(),
  tags:       z.string().optional(), // comma-separated; split on submit
});

type FormValues = z.infer<typeof schema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

export default function KBEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEditing = !!id;

  const { data: existing, isLoading: articleLoading } = useQuery({
    queryKey: ['kb-article-edit', id],
    queryFn: () => api.get(`/kb/articles/${id}`).then(r => r.data),
    enabled: isEditing,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories').then(r => r.data),
    staleTime: Infinity,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (existing) {
      reset({
        title:      existing.title,
        body:       existing.body,
        categoryId: existing.category?.id ?? '',
        tags:       existing.tags?.join(', ') ?? '',
      });
    }
  }, [existing, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        title:      values.title,
        body:       values.body,
        categoryId: values.categoryId || undefined,
        tags:       values.tags
          ? values.tags.split(',').map(t => t.trim()).filter(Boolean)
          : [],
      };
      return isEditing
        ? api.patch(`/kb/articles/${id}`, payload).then(r => r.data)
        : api.post('/kb/articles', payload).then(r => r.data);
    },
    onSuccess: (article) => navigate(`/kb/${article.id}`),
  });

  const bodyValue = watch('body') ?? '';

  if (isEditing && articleLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32 text-gray-400 text-sm">
          Loading article…
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <Link to="/kb" className="text-sm text-indigo-600 hover:underline">
          ← Knowledge Base
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        {isEditing ? 'Edit Article' : 'New KB Article'}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {isEditing
          ? 'Editing content only. Use the Publish button on the article page to change its status.'
          : 'Articles are saved as a draft. An IT Admin can publish from the article page.'}
      </p>

      <form
        onSubmit={handleSubmit(v => saveMutation.mutateAsync(v))}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* ── Main content (left 2 cols) ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                {...register('title')}
                type="text"
                placeholder="e.g. How to reset your password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <FieldError message={errors.title?.message} />
            </div>

            {/* Body */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Body <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-1.5">
                Supports basic Markdown: # Heading, ## Sub-heading, **bold**, - bullet list
              </p>
              <textarea
                {...register('body')}
                rows={18}
                placeholder={'# Heading\n\nWrite your article here.\n\n## Steps\n\n- Step 1\n- Step 2\n\n**Note:** Important information here.'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                           resize-y"
              />
              <FieldError message={errors.body?.message} />
            </div>
          </div>

          {/* Live preview */}
          {bodyValue.length > 10 && (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Preview
              </p>
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                {bodyValue.split('\n').map((line, i) => {
                  if (line.startsWith('# '))  return <h2 key={i} className="text-lg font-bold text-gray-900 mt-4 mb-2">{line.slice(2)}</h2>;
                  if (line.startsWith('## ')) return <h3 key={i} className="text-base font-semibold text-gray-800 mt-3 mb-1">{line.slice(3)}</h3>;
                  if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
                  if (line === '') return <br key={i} />;
                  const parts = line.split(/(\*\*[^*]+\*\*)/g);
                  return (
                    <p key={i} className="mb-1">
                      {parts.map((p, j) =>
                        p.startsWith('**') && p.endsWith('**')
                          ? <strong key={j}>{p.slice(2, -2)}</strong> : p)}
                    </p>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar (right col) ─────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Settings
            </h2>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                {...register('categoryId')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">— None —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <input
                {...register('tags')}
                type="text"
                placeholder="password, vpn, wifi (comma-separated)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-400">Separate with commas</p>
            </div>

            {/* Status hint */}
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2">
              <p className="text-xs text-yellow-700">
                Articles are saved as <strong>Draft</strong>.
                An IT Admin can publish from the article page.
              </p>
            </div>
          </div>

          {/* Submit */}
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isSubmitting || saveMutation.isPending}
              className="w-full px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saveMutation.isPending
                ? 'Saving…'
                : isEditing ? 'Save Changes' : 'Save as Draft'}
            </button>
            <Link
              to={isEditing ? `/kb/${id}` : '/kb'}
              className="w-full text-center px-4 py-2 rounded-lg border border-gray-200
                         text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
          </div>

          {saveMutation.isError && (
            <p className="text-xs text-red-600 text-center">Save failed. Please try again.</p>
          )}
        </div>
      </form>
    </Layout>
  );
}
