import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Product, StockBatch } from "../../types";
import { date as fmtDate } from "../../lib/format";
import type { CartLine, DetailRow, EditSeed } from "./types";

// Left work area: search → product detail (view-only) → stock-lot picker →
// line editor (price / qty / discount) → Add/Update.
export default function ProductPanel({
  products,
  searchText,
  qtyByProduct,
  lotsByProduct,
  detailRowsFor,
  cur,
  isEditing,
  seed,
  searchInputRef,
  onProductPicked,
  onSubmit,
}: {
  products: Product[];
  searchText: (p: Product) => string;
  qtyByProduct: Map<string, number>;
  lotsByProduct: Map<string, StockBatch[]>;
  detailRowsFor: (p: Product) => DetailRow[];
  cur: (n: number) => string;
  isEditing: boolean;
  seed: EditSeed | null;
  searchInputRef: RefObject<HTMLInputElement>;
  onProductPicked: () => void;
  onSubmit: (line: CartLine) => void;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [product, setProduct] = useState<Product | null>(null);
  const [lotId, setLotId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const qtyRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => searchText(p).includes(q)).slice(0, 30);
  }, [products, query, searchText]);

  const lots = product ? lotsByProduct.get(product.id) ?? [] : [];

  // Oldest open lot with a price (the one FIFO will draw / the headline price).
  const pickDefaultLot = (p: Product): StockBatch | null => {
    const ls = lotsByProduct.get(p.id) ?? [];
    return ls.find((l) => (l.sell_price ?? 0) > 0) ?? ls[0] ?? null;
  };

  const resetEditor = () => {
    setProduct(null);
    setLotId(null);
    setQty(1);
    setUnitPrice(0);
    setDiscount(0);
  };

  const loadProduct = (p: Product) => {
    const lot = pickDefaultLot(p);
    setProduct(p);
    setLotId(lot?.id ?? null);
    setUnitPrice(lot && (lot.sell_price ?? 0) > 0 ? (lot.sell_price as number) : p.sell_price);
    setQty(1);
    setDiscount(0);
    setQuery("");
    setHighlight(0);
    onProductPicked();
    setTimeout(() => qtyRef.current?.focus(), 0);
  };

  const selectLot = (lot: StockBatch) => {
    setLotId(lot.id);
    if ((lot.sell_price ?? 0) > 0) setUnitPrice(lot.sell_price as number);
  };

  const submit = () => {
    if (!product) return;
    onSubmit({
      product,
      qty: Math.max(1, qty || 1),
      unit_price: Math.max(0, unitPrice || 0),
      discount: Math.max(0, discount || 0),
      lot: lotId ?? undefined,
    });
    resetEditor();
    setQuery("");
    setHighlight(0);
    searchInputRef.current?.focus();
  };

  // Load an existing cart line back into the editor when the parent seeds one.
  useEffect(() => {
    if (!seed) return;
    const l = seed.line;
    setProduct(l.product);
    setLotId(l.lot ?? null);
    setQty(l.qty);
    setUnitPrice(l.unit_price);
    setDiscount(l.discount);
    setQuery("");
    setHighlight(0);
    setTimeout(() => qtyRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.nonce]);

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (!query) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(results.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const q = query.trim().toLowerCase();
      // Fast path: an exact barcode/SKU scan adds immediately at the lot price.
      const exact = products.find(
        (p) => (p.barcode ?? "").toLowerCase() === q || p.sku.toLowerCase() === q
      );
      if (exact) {
        const lot = pickDefaultLot(exact);
        const price =
          lot && (lot.sell_price ?? 0) > 0
            ? (lot.sell_price as number)
            : exact.sell_price;
        onProductPicked();
        onSubmit({ product: exact, qty: 1, unit_price: price, discount: 0, lot: lot?.id });
        setQuery("");
        setHighlight(0);
      } else if (results[highlight]) {
        loadProduct(results[highlight]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
    }
  };

  const onEditorKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const lineTotal = Math.max(0, qty * unitPrice - discount);
  const detailRows = product ? detailRowsFor(product) : [];

  return (
    <section className="pos-left">
      <input
        ref={searchInputRef}
        className="pos-search"
        placeholder="Search name, code, barcode, category, make…  (F2)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={onSearchKey}
        onBlur={(e) => {
          if (!e.relatedTarget) setTimeout(() => searchInputRef.current?.focus(), 0);
        }}
      />

      {query ? (
        <div className="pos-results">
          {results.length === 0 ? (
            <div className="empty">No matches.</div>
          ) : (
            results.map((p, i) => (
              <div
                key={p.id}
                className={i === highlight ? "pos-result active" : "pos-result"}
                onMouseDown={(e) => {
                  e.preventDefault();
                  loadProduct(p);
                }}
              >
                <span className="pos-result-name">
                  <code>{p.sku}</code> {p.name}
                </span>
                <span className="pos-result-meta">
                  <span className="pr-qty">Qty {qtyByProduct.get(p.id) ?? 0}</span>
                </span>
              </div>
            ))
          )}
        </div>
      ) : !product ? (
        <div className="pos-left-empty empty">
          Search a product to view its details and stock.
        </div>
      ) : (
        <div className="pos-editor">
          {/* read-only product detail card */}
          <div className="pos-detail card">
            <div className="pos-detail-head">
              <h3>{product.name}</h3>
              {isEditing && <span className="badge">Editing line</span>}
            </div>
            <dl className="pos-detail-grid">
              {detailRows.map((r) => (
                <div key={r.label} className="pos-detail-row">
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* stock-lot picker */}
          <div className="pos-lots">
            <div className="pos-lots-head">
              Stock lots{" "}
              <span className="muted">
                (in stock: {qtyByProduct.get(product.id) ?? 0})
              </span>
            </div>
            {lots.length === 0 ? (
              <div className="empty">No tracked lots — using catalogue price.</div>
            ) : (
              <table className="pos-lots-table">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th className="num">Qty left</th>
                    <th className="num">Buy</th>
                    <th className="num">Sell</th>
                    <th className="num">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => {
                    const buy = lot.unit_cost ?? 0;
                    const sell = lot.sell_price ?? 0;
                    const margin = sell - buy;
                    const pct = sell > 0 ? (margin / sell) * 100 : 0;
                    return (
                      <tr
                        key={lot.id}
                        className={lot.id === lotId ? "row-selected" : ""}
                        onClick={() => selectLot(lot)}
                      >
                        <td>{fmtDate(lot.received_at) || "—"}</td>
                        <td className="num">{lot.qty_remaining}</td>
                        <td className="num">{cur(buy)}</td>
                        <td className="num">{cur(sell)}</td>
                        <td className={margin < 0 ? "num below-cost" : "num"}>
                          {cur(margin)} ({pct.toFixed(0)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* line editor */}
          <div className="pos-line-editor" onKeyDown={onEditorKey}>
            <div className="field">
              <label>Quantity</label>
              <input
                ref={qtyRef}
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="field">
              <label>Unit price</label>
              <input
                type="number"
                min={0}
                step="any"
                value={unitPrice}
                onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="field">
              <label>Discount</label>
              <input
                type="number"
                min={0}
                step="any"
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="field">
              <label>Line total</label>
              <div className="pos-line-total">{cur(lineTotal)}</div>
            </div>
            <div className="pos-line-actions">
              <button className="btn btn-primary" onClick={submit}>
                {isEditing ? "Update line" : "Add to bill"}
              </button>
              <button className="btn btn-ghost" onClick={resetEditor}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
