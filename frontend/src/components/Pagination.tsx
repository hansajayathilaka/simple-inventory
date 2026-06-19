// Compact pagination controls shared by every list/table.
export default function Pagination({
  page,
  totalPages,
  totalItems,
  onChange,
  isFetching,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onChange: (page: number) => void;
  isFetching?: boolean;
}) {
  if (totalItems === 0) return null;
  return (
    <div className="pagination">
      <span className="muted">
        {totalItems} item{totalItems === 1 ? "" : "s"}
        {isFetching ? " · …" : ""}
      </span>
      <div className="inline" style={{ gap: 6 }}>
        <button
          className="btn btn-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          ← Prev
        </button>
        <span className="muted" style={{ minWidth: 90, textAlign: "center" }}>
          Page {page} / {totalPages}
        </span>
        <button
          className="btn btn-sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
