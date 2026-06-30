interface PaginationProps {
  page:       number;
  totalPages: number;
  total:      number;
  onPageChange: (page: number) => void;
}

/** Simple Previous / Next pager with "Page X of Y" — shared across list pages. */
export default function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
      <span>
        Page <span className="font-medium text-gray-900">{page}</span> of{' '}
        <span className="font-medium text-gray-900">{totalPages}</span>
        <span className="text-gray-400"> · {total} total</span>
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700
                     hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ← Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700
                     hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/** Standard paginated envelope returned by list endpoints. */
export interface Paginated<T> {
  data:       T[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}
