import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/api';
import Layout from '../../components/Layout';
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
  PUBLISHED: 'bg-green-50 text-green-700 border border-green-200',
  DRAFT:     'bg-yellow-50 text-yellow-700 border border-yellow-200',
  ARCHIVED:  'bg-gray-100 text-gray-500 border border-gray-200',
};

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
      api.get<KBListResponse>('/kb', {
        params: { q: search || undefined, page, limit },
      }).then(r => r.data),
  });

  const articles = data?.data ?? [];
  const total = data?.total ?? 0;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(q);
    setPage(1);
  }

  return (
    <Layout>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Browse guides, FAQs, and how-to articles
          </p>
        </div>
        {isEditor && (
          <Link
            to="/kb/new"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                       bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <span>+</span> New Article
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
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                     hover:bg-indigo-700 transition-colors"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setQ(''); setSearch(''); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600
                       hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          Loading articles…
        </div>
      )}

      {!isLoading && articles.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col
                        items-center justify-center py-20 text-gray-400">
          <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-sm font-medium">
            {search ? `No articles match "${search}"` : 'No articles yet'}
          </p>
          {isEditor && !search && (
            <Link to="/kb/new" className="mt-3 text-sm text-indigo-600 hover:underline">
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
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-200
                         hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link
                      to={`/kb/${article.id}`}
                      className="text-base font-semibold text-gray-900 hover:text-indigo-600
                                 transition-colors"
                    >
                      {article.title}
                    </Link>
                    {isEditor && (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold
                                        ${STATUS_STYLES[article.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {article.status}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap text-xs text-gray-400 mt-1">
                    {article.category && (
                      <span className="text-gray-500">{article.category.name}</span>
                    )}
                    {article.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {article.tags.slice(0, 4).map(tag => (
                          <span key={tag} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs">
                            {tag}
                          </span>
                        ))}
                        {article.tags.length > 4 && (
                          <span className="text-gray-400">+{article.tags.length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-400 shrink-0">
                  <span title="Views">👁 {article.views}</span>
                  <span title="Helpful">👍 {article.helpfulCount}</span>
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

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40
                         hover:bg-white transition-colors bg-white"
            >
              Previous
            </button>
            <button
              disabled={page * limit >= total}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40
                         hover:bg-white transition-colors bg-white"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
