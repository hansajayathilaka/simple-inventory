import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { productsService } from "../../services";
import { useSettings } from "../../settings/SettingsContext";
import type { Product } from "../../types";
import { renderBarcode } from "../../lib/barcode";
import { printHTML, nodeToDocument } from "../../lib/print";

// One barcode rendered into an inline <svg> (so it serializes for printing).
function Barcode({ value, symbology }: { value: string; symbology: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    renderBarcode(ref.current, value, symbology, { height: 34, fontSize: 11 });
  }, [value, symbology]);
  return <svg ref={ref} />;
}

interface Selected {
  product: Product;
  qty: number;
}

export default function TagsPage() {
  const { settings, currency } = useSettings();
  const label = settings?.label;
  const sheetRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selected[]>([]);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsService.all({ sort: "name" }),
  });

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (products ?? [])
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 15);
  }, [products, search]);

  const add = (p: Product) => {
    setSelected((prev) =>
      prev.some((s) => s.product.id === p.id) ? prev : [...prev, { product: p, qty: 1 }]
    );
    setSearch("");
  };
  const setQty = (id: string, qty: number) =>
    setSelected((prev) => prev.map((s) => (s.product.id === id ? { ...s, qty } : s)));
  const remove = (id: string) =>
    setSelected((prev) => prev.filter((s) => s.product.id !== id));

  // Expand selections into individual labels (one per quantity).
  const labels = useMemo(() => {
    const out: Product[] = [];
    for (const s of selected) for (let i = 0; i < Math.max(0, s.qty); i++) out.push(s.product);
    return out;
  }, [selected]);

  const w = label?.widthMm ?? 50;
  const h = label?.heightMm ?? 30;
  const cols = label?.columns ?? 3;
  const symbology = label?.symbology ?? "CODE128";

  const print = () => {
    if (!sheetRef.current || labels.length === 0) return;
    const css = `
      @page { margin: 5mm; }
      .sheet { display: grid; grid-template-columns: repeat(${cols}, ${w}mm); gap: 2mm; }
      .label { width: ${w}mm; height: ${h}mm; border: 1px solid #ccc; padding: 1mm;
               display: flex; flex-direction: column; align-items: center; justify-content: center;
               overflow: hidden; text-align: center; font-size: 10px; }
      .label .nm { font-weight: 600; }
      .label svg { max-width: 100%; }
    `;
    const html = nodeToDocument(sheetRef.current, css);
    printHTML(html, {
      silent: !!settings?.printers?.silent,
      deviceName: settings?.printers?.labelPrinter || undefined,
    }).catch((e) => alert(String(e)));
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Tag Stickers</h1>
          <div className="muted">
            Print product price/barcode labels ({symbology}, {w}×{h}mm, {cols} per row).
            Configure size & symbology in Settings.
          </div>
        </div>
        <button className="btn btn-primary" onClick={print} disabled={labels.length === 0}>
          Print {labels.length} label{labels.length === 1 ? "" : "s"}
        </button>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Add products</h2>
          <div className="field">
            <input
              placeholder="Search by name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {search && (
            <div className="card search-results" style={{ padding: 0 }}>
              {results.length === 0 ? (
                <div className="empty">No matches.</div>
              ) : (
                <table>
                  <tbody>
                    {results.map((p) => (
                      <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => add(p)}>
                        <td><code>{p.sku}</code></td>
                        <td>{p.name}</td>
                        <td className="num">{currency}{(p.sell_price ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ width: 90 }}>Qty</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {selected.length === 0 ? (
                <tr><td colSpan={3} className="empty">No products selected.</td></tr>
              ) : (
                selected.map((s) => (
                  <tr key={s.product.id}>
                    <td>{s.product.name}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={s.qty}
                        onChange={(e) => setQty(s.product.id, Math.max(1, Number(e.target.value)))}
                      />
                    </td>
                    <td>
                      <button className="btn btn-sm btn-ghost" onClick={() => remove(s.product.id)}>✕</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Preview</h2>
          {labels.length === 0 ? (
            <div className="empty">Add products to preview labels.</div>
          ) : (
            <div
              ref={sheetRef}
              className="sheet"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, ${w}mm)`,
                gap: "2mm",
              }}
            >
              {labels.map((p, i) => (
                <div
                  key={i}
                  className="label"
                  style={{
                    width: `${w}mm`,
                    height: `${h}mm`,
                    border: "1px solid #ccc",
                    padding: "1mm",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    textAlign: "center",
                    fontSize: 10,
                  }}
                >
                  {label?.showName && <div className="nm" style={{ fontWeight: 600 }}>{p.name}</div>}
                  {label?.showPrice && <div>{currency}{(p.sell_price ?? 0).toFixed(2)}</div>}
                  {label?.showBarcode && <Barcode value={p.barcode || p.sku} symbology={symbology} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
