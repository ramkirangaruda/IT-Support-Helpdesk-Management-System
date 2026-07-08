import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import { useAuth } from '../../auth/useAuth';

interface KBArticle {
  id: string;
  title: string;
  body: string;
  status: string;
  tags: string[];
  views: number;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
}

const EDITOR_ROLES  = new Set(['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN']);
const PUBLISH_ROLES = new Set(['IT_ADMIN', 'SYS_ADMIN']);

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function BodyRenderer({ body }: { body: string }) {
  const lines = body.split('\n');
  return (
    <div className="prose prose-sm max-w-none text-ink-soft leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('# '))
          return <h2 key={i} className="text-lg font-bold text-ink mt-4 mb-2">{line.slice(2)}</h2>;
        if (line.startsWith('## '))
          return <h3 key={i} className="text-base font-semibold text-ink-soft mt-3 mb-1">{line.slice(3)}</h3>;
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
        if (line.startsWith('```') || line === '') return <br key={i} />;
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className="mb-1">
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={j}>{part.slice(2, -2)}</strong>
                : part
            )}
          </p>
        );
      })}
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <Layout>
      <div className="max-w-3xl animate-pulse space-y-5">
        <div className="h-4 w-32 bg-[#f2f2f7] rounded" />
        <div className="h-7 w-2/3 bg-[#f2f2f7] rounded" />
        <div className="h-3 w-48 bg-[#f2f2f7] rounded" />
        <div className="bg-white rounded-xl border border-hair p-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`h-3 bg-[#f2f2f7] rounded ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      </div>
    </Layout>
  );
}

export default function KBArticlePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [feedbackGiven, setFeedbackGiven] = useState<'yes' | 'no' | null>(null);

  const isEditor   = user?.roles.some(r => EDITOR_ROLES.has(r));
  const canPublish = user?.roles.some(r => PUBLISH_ROLES.has(r));

  const { data: article, isLoading, isError } = useQuery<KBArticle>({
    queryKey: ['kb-article', id],
    queryFn: () => api.get<KBArticle>(`/kb/articles/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const feedbackMutation = useMutation({
    mutationFn: (helpful: boolean) =>
      api.post(`/kb/articles/${id}/feedback`, { helpful }).then(r => r.data),
    onSuccess: (_data, helpful) => setFeedbackGiven(helpful ? 'yes' : 'no'),
  });

  const publishMutation = useMutation({
    mutationFn: () => api.post(`/kb/articles/${id}/publish`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-article', id] });
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.delete(`/kb/articles/${id}`).then(r => r.data),
    onSuccess: () => navigate('/kb'),
  });

  if (isLoading) return <ArticleSkeleton />;

  if (isError || !article) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <p className="text-sm text-[#c0392b]">Article not found.</p>
          <Link to="/kb" className="text-sm text-indigo-600 hover:underline">
            ← Back to Knowledge Base
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-4">
        <Link to="/kb" className="text-sm text-indigo-600 hover:underline">
          ← Knowledge Base
        </Link>
      </div>

      <div className="max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[22px] font-semibold text-ink leading-snug">{article.title}</h1>

            {isEditor && (
              <div className="flex gap-2 shrink-0">
                <Link
                  to={`/kb/${article.id}/edit`}
                  className="px-3 py-1.5 text-sm border border-hair rounded-lg text-ink-soft
                             hover:bg-[#fafafa] font-medium"
                >
                  Edit
                </Link>

                {canPublish && article.status === 'DRAFT' && (
                  <button
                    onClick={() => publishMutation.mutate()}
                    disabled={publishMutation.isPending}
                    className="px-3 py-1.5 text-sm border border-[#a3d9b8] rounded-lg text-[#1a7f4b]
                               hover:bg-[#eafaf3] font-medium disabled:opacity-50"
                  >
                    {publishMutation.isPending ? 'Publishing…' : 'Publish'}
                  </button>
                )}

                {canPublish && article.status !== 'ARCHIVED' && (
                  <button
                    onClick={() => {
                      if (confirm('Archive this article? It will no longer be visible to users.')) {
                        archiveMutation.mutate();
                      }
                    }}
                    disabled={archiveMutation.isPending}
                    className="px-3 py-1.5 text-sm border border-[#fecdd3] rounded-lg text-[#c0392b]
                               hover:bg-[#fff1f2] font-medium disabled:opacity-50"
                  >
                    Archive
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-ink-muted">
            {article.category && (
              <span className="text-ink-soft font-medium">{article.category.name}</span>
            )}
            <span>Updated {formatDate(article.updatedAt)}</span>
            <span>{article.views} views</span>
            <span>{article.helpfulCount} found helpful</span>
            {isEditor && article.status !== 'PUBLISHED' && (
              <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold
                ${article.status === 'DRAFT'
                  ? 'bg-[#fef9ec] text-[#b07800] border-[#f0d870]'
                  : 'bg-[#f2f2f7] text-[#6e6e73] border-hair'}`}>
                {article.status}
              </span>
            )}
          </div>

          {article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {article.tags.map(tag => (
                <span key={tag}
                  className="bg-[#e0f0fe] text-indigo-600 border border-[#b6d8ff]
                             rounded-full px-2.5 py-0.5 text-xs font-medium">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="bg-white rounded-xl border border-hair p-6 mb-6">
          <BodyRenderer body={article.body} />
        </div>

        {/* Helpful feedback — only for published articles */}
        {article.status === 'PUBLISHED' && (
          <div className="bg-[#fafafa] rounded-xl border border-hair px-6 py-4">
            {feedbackGiven ? (
              <p className="text-sm text-ink-soft text-center">
                {feedbackGiven === 'yes'
                  ? 'Thanks! We\'re glad this helped.'
                  : 'Thanks for the feedback. We\'ll work to improve this article.'}
              </p>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-ink-soft">Was this article helpful?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => feedbackMutation.mutate(true)}
                    disabled={feedbackMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                               bg-white border border-hair text-ink-soft
                               hover:border-[#a3d9b8] hover:text-[#1a7f4b] hover:bg-[#eafaf3]
                               disabled:opacity-50"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => feedbackMutation.mutate(false)}
                    disabled={feedbackMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                               bg-white border border-hair text-ink-soft
                               hover:border-[#fecdd3] hover:text-[#c0392b] hover:bg-[#fff1f2]
                               disabled:opacity-50"
                  >
                    No
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
