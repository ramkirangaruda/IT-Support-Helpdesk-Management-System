import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
import Pagination from '../../components/Pagination';
import { useAuth } from '../../auth/useAuth';

interface KBArticleSummary {
  id: string;
  title: string;
  status: string;
  tags: string[];
  views: number;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
}

interface KBListResponse {
  data: KBArticleSummary[];
  total: number;
  page: number;
  limit: number;
}

const EDITOR_ROLES = new Set(['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN']);

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: 'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]',
  DRAFT:     'bg-[#fef9ec] text-[#b07800] border-[#f0d870]',
  ARCHIVED:  'bg-[#f2f2f7] text-[#6e6e73] border-hair',
};

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-hair p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 bg-[#f2f2f7] rounded" />
          <div className="h-3 w-1/3 bg-[#f2f2f7] rounded" />
        </div>
        <div className="h-4 w-12 bg-[#f2f2f7] rounded" />
      </div>
    </div>
  );
}

export default function KBListPage() {
  const { user } = useAuth();
  const isEditor = user?.roles.some(r => EDITOR_ROLES.has(r));
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery<KBListResponse>({
    queryKey: ['kb-articles', search, page],
    queryFn: () =>
      api.get<KBListResponse>('/kb/articles', {
        params: { q: search || undefined, page, limit },
      }).then(r => r.data),
  });

  const articles = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(q);
    setPage(1);
  }

  return (
    <Layout>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Knowledge Base</h1>
          <p className="text-sm text-ink-muted mt-0.5">Browse guides, FAQs, and how-to articles</p>
        </div>
        {isEditor && (
          <Link
            to="/kb/new"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                       bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            + New Article
          </Link>
        )}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-2 max-w-xl">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search articles…"
          className="flex-1 rounded-lg border border-hair px-4 py-2 text-sm
                     focus:outline-none focus:border-2 focus:border-indigo-600"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setQ(''); setSearch(''); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]"
          >
            Clear
          </button>
        )}
      </form>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {!isLoading && articles.length === 0 && (
        <div className="bg-white rounded-xl border border-hair flex flex-col
                        items-center justify-center py-20 gap-3">
          <svg className="w-10 h-10 text-[#d2d2d7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-sm font-medium text-ink-muted">
            {search ? `No articles match "${search}"` : 'No articles yet'}
          </p>
          {isEditor && !search && (
            <Link to="/kb/new" className="text-sm text-indigo-600 hover:underline">
              Create the first article →
            </Link>
          )}
        </div>
      )}

      {articles.length > 0 && (
        <div className="space-y-3">
          {articles.map(article => (
            <div
              key={article.id}
              className="bg-white rounded-xl border border-hair p-5 hover:border-indigo-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link
                      to={`/kb/${article.id}`}
                      className="text-base font-semibold text-ink hover:text-indigo-600"
                    >
                      {article.title}
                    </Link>
                    {isEditor && (
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-semibold
                        ${STATUS_STYLES[article.status] ?? 'bg-[#f2f2f7] text-[#6e6e73] border-hair'}`}>
                        {article.status}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap text-xs text-ink-muted mt-1">
                    {article.category && (
                      <span className="text-ink-soft font-medium">{article.category.name}</span>
                    )}
                    {article.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {article.tags.slice(0, 4).map(tag => (
                          <span key={tag}
                            className="bg-[#f2f2f7] text-ink-muted px-1.5 py-0.5 rounded-full text-xs">
                            {tag}
                          </span>
                        ))}
                        {article.tags.length > 4 && (
                          <span className="text-ink-muted">+{article.tags.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-ink-muted shrink-0">
                  <span title="Views">{article.views} views</span>
                  <span title="Helpful">{article.helpfulCount} helpful</span>
                  {isEditor && (
                    <Link
                      to={`/kb/${article.id}/edit`}
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      Edit
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > limit && (
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      )}
    </Layout>
  );
}
