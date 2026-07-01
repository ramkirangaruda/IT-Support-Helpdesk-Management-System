interface PaginationProps {
  page:       number;
  totalPages: number;
  total:      number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <span className="text-[13px] text-ink-muted">
        Page <span className="font-medium text-ink">{page}</span> of{' '}
        <span className="font-medium text-ink">{totalPages}</span>
        <span className="text-ink-muted"> · {total} total</span>
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg border border-hair bg-white text-[13px] text-ink-soft
                     hover:bg-[#fafafa] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Prev
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-lg border border-hair bg-white text-[13px] text-ink-soft
                     hover:bg-[#fafafa] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export interface Paginated<T> {
  data:       T[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}
