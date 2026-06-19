import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RecordModel } from "pocketbase";

// A searchable, windowed (virtualized) replacement for native <select> backed by
// a PocketBase collection. Options are fetched from the server one page at a time
// as the user searches/scrolls, so a dropdown never loads the whole collection.
//
// Use SearchSelect for single value, MultiSearchSelect for multiple. Both take a
// CRUD `service` (from services/crud `collection<T>()`) and the field(s) to
// search on.

interface CrudService<T> {
  list: (opts: {
    page?: number;
    perPage?: number;
    sort?: string;
    filter?: string;
  }) => Promise<{ items: T[]; totalPages: number }>;
  one: (id: string) => Promise<T>;
}

interface BaseProps<T extends RecordModel> {
  service: CrudService<T>;
  searchFields: string[];
  getLabel?: (r: T) => string;
  placeholder?: string;
  disabled?: boolean;
  perPage?: number;
}

const ROW_H = 36; // px, fixed row height for windowing
const LIST_H = 300; // px, visible dropdown height
const OVERSCAN = 4;

const defaultLabel = (r: RecordModel) =>
  (r as { name?: string }).name ?? r.id;

// Shared remote, paginated search state.
function useRemoteSearch<T extends RecordModel>(
  service: CrudService<T>,
  searchFields: string[],
  perPage: number,
  open: boolean
) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState(""); // debounced query
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);
  // searchFields is typically an inline array (new identity each render); key it
  // by content so the fetch callbacks stay stable and don't refetch on every
  // parent render.
  const fieldsKey = searchFields.join(",");
  const fieldsRef = useRef(searchFields);
  fieldsRef.current = searchFields;

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filterFor = useCallback(
    (text: string) => {
      const s = text.replace(/["\\]/g, "");
      if (!s) return undefined;
      return (
        "(" + fieldsRef.current.map((f) => `${f} ~ "${s}"`).join(" || ") + ")"
      );
    },
    [fieldsKey]
  );

  const load = useCallback(
    async (p: number, reset: boolean, text: string) => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const res = await service.list({
          page: p,
          perPage,
          sort: fieldsRef.current[0],
          filter: filterFor(text),
        });
        if (id !== reqId.current) return; // a newer request superseded this one
        setTotalPages(res.totalPages);
        setPage(p);
        setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [service, perPage, filterFor]
  );

  // (re)load first page whenever opened or the query changes
  useEffect(() => {
    if (open) load(1, true, dq);
  }, [open, dq, load]);

  const loadMore = useCallback(() => {
    if (!loading && page < totalPages) load(page + 1, false, dq);
  }, [loading, page, totalPages, dq, load]);

  return { q, setQ, items, loading, loadMore };
}

// Windowed list with infinite scroll. Renders only the visible slice.
function OptionList<T extends RecordModel>({
  items,
  loading,
  loadMore,
  highlight,
  setHighlight,
  onPick,
  getLabel,
  isSelected,
  listRef,
}: {
  items: T[];
  loading: boolean;
  loadMore: () => void;
  highlight: number;
  setHighlight: (n: number) => void;
  onPick: (r: T) => void;
  getLabel: (r: T) => string;
  isSelected: (r: T) => boolean;
  listRef: React.RefObject<HTMLDivElement>;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const total = items.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + LIST_H) / ROW_H) + OVERSCAN);
  const visible = items.slice(start, end);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    if (el.scrollHeight - el.scrollTop - el.clientHeight < ROW_H * 3) loadMore();
  };

  // keep the highlighted row in view during keyboard nav
  useEffect(() => {
    const el = listRef.current;
    if (!el || highlight < 0) return;
    const top = highlight * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + LIST_H) el.scrollTop = top + ROW_H - LIST_H;
  }, [highlight, listRef]);

  return (
    <div
      className="ss-list"
      ref={listRef}
      style={{ maxHeight: LIST_H }}
      onScroll={onScroll}
    >
      {total === 0 && !loading ? (
        <div className="ss-empty">No matches.</div>
      ) : (
        <div style={{ height: total * ROW_H, position: "relative" }}>
          {visible.map((r, i) => {
            const idx = start + i;
            return (
              <div
                key={r.id}
                className={
                  "ss-option" +
                  (idx === highlight ? " active" : "") +
                  (isSelected(r) ? " selected" : "")
                }
                style={{
                  position: "absolute",
                  top: idx * ROW_H,
                  height: ROW_H,
                  left: 0,
                  right: 0,
                }}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(r);
                }}
              >
                {isSelected(r) && <span className="ss-check">✓</span>}
                {getLabel(r)}
              </div>
            );
          })}
        </div>
      )}
      {loading && <div className="ss-loading">Loading…</div>}
    </div>
  );
}

// ---- Single-select ----------------------------------------------------------

interface SingleProps<T extends RecordModel> extends BaseProps<T> {
  value: string;
  // record is provided when a row is picked (not on clear)
  onChange: (id: string, record?: T) => void;
  required?: boolean;
  allowClear?: boolean;
}

export function SearchSelect<T extends RecordModel>({
  service,
  searchFields,
  getLabel = defaultLabel as (r: T) => string,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  required,
  allowClear = true,
  perPage = 50,
}: SingleProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { q, setQ, items, loading, loadMore } = useRemoteSearch(
    service,
    searchFields,
    perPage,
    open
  );

  // resolve the label of the current value (it may not be in the loaded page)
  const getLabelRef = useRef(getLabel);
  getLabelRef.current = getLabel;
  const [valueLabel, setValueLabel] = useState("");
  useEffect(() => {
    let active = true;
    if (!value) {
      setValueLabel("");
      return;
    }
    const known = items.find((r) => r.id === value);
    if (known) {
      setValueLabel(getLabelRef.current(known));
      return;
    }
    service
      .one(value)
      .then((r) => active && setValueLabel(getLabelRef.current(r)))
      .catch(() => active && setValueLabel(""));
    return () => {
      active = false;
    };
  }, [value, items, service]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    setHighlight(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const pick = (r: T) => {
    onChange(r.id, r);
    setValueLabel(getLabel(r));
    setQ("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[highlight]) pick(items[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={"ss" + (disabled ? " disabled" : "")} ref={rootRef}>
      {open ? (
        <input
          ref={inputRef}
          className="ss-input"
          placeholder="Type to search…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
        />
      ) : (
        <button
          type="button"
          className={"ss-control" + (value ? "" : " placeholder")}
          onClick={openMenu}
          disabled={disabled}
        >
          <span className="ss-value">{value ? valueLabel || "…" : placeholder}</span>
          {allowClear && value && !required ? (
            <span
              className="ss-clear"
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            >
              ✕
            </span>
          ) : (
            <span className="ss-caret">▾</span>
          )}
        </button>
      )}
      {open && (
        <OptionList
          items={items}
          loading={loading}
          loadMore={loadMore}
          highlight={highlight}
          setHighlight={setHighlight}
          onPick={pick}
          getLabel={getLabel}
          isSelected={(r) => r.id === value}
          listRef={listRef}
        />
      )}
    </div>
  );
}

// ---- Multi-select -----------------------------------------------------------

interface MultiProps<T extends RecordModel> extends BaseProps<T> {
  value: string[];
  onChange: (ids: string[]) => void;
}

export function MultiSearchSelect<T extends RecordModel>({
  service,
  searchFields,
  getLabel = defaultLabel as (r: T) => string,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  perPage = 50,
}: MultiProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { q, setQ, items, loading, loadMore } = useRemoteSearch(
    service,
    searchFields,
    perPage,
    open
  );

  // resolve labels for the selected ids (cached so chips render when closed)
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    const known: Record<string, string> = {};
    items.forEach((r) => (known[r.id] = getLabel(r)));
    const missing = value.filter((id) => !labels[id] && !known[id]);
    if (Object.keys(known).length) setLabels((p) => ({ ...p, ...known }));
    missing.forEach((id) =>
      service
        .one(id)
        .then((r) => setLabels((p) => ({ ...p, [id]: getLabel(r) })))
        .catch(() => undefined)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, value]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (r: T) => {
    if (selected.has(r.id)) onChange(value.filter((id) => id !== r.id));
    else {
      setLabels((p) => ({ ...p, [r.id]: getLabel(r) }));
      onChange([...value, r.id]);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[highlight]) toggle(items[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={"ss" + (disabled ? " disabled" : "")} ref={rootRef}>
      {value.length > 0 && (
        <div className="ss-chips">
          {value.map((id) => (
            <span key={id} className="ss-chip">
              {labels[id] ?? "…"}
              <span
                className="ss-chip-x"
                role="button"
                onClick={() => onChange(value.filter((v) => v !== id))}
              >
                ✕
              </span>
            </span>
          ))}
        </div>
      )}
      {open ? (
        <input
          ref={inputRef}
          className="ss-input"
          placeholder="Type to search…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
        />
      ) : (
        <button
          type="button"
          className="ss-control placeholder"
          onClick={() => {
            if (disabled) return;
            setOpen(true);
            setHighlight(0);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          disabled={disabled}
        >
          <span className="ss-value">
            {value.length ? `Add more… (${value.length})` : placeholder}
          </span>
          <span className="ss-caret">▾</span>
        </button>
      )}
      {open && (
        <OptionList
          items={items}
          loading={loading}
          loadMore={loadMore}
          highlight={highlight}
          setHighlight={setHighlight}
          onPick={toggle}
          getLabel={getLabel}
          isSelected={(r) => selected.has(r.id)}
          listRef={listRef}
        />
      )}
    </div>
  );
}
