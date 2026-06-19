import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import {
  batchesService,
  inventoryService,
  productsService,
  stockService,
} from "../../services";
import type { Inventory, Product, StockBatch } from "../../types";
import { errorMessage } from "../../lib/errors";
import { money as fmtMoney, date as fmtDate } from "../../lib/format";

interface Row {
  product: Product;
  qty: number;
  reorder: number;
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<null | "restock" | "adjust">(null);
  const [target, setTarget] = useState<Product | null>(null);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [lotsTarget, setLotsTarget] = useState<Product | null>(null);

  const q = search.trim().replace(/["\\]/g, "");
  const filter = q ? `(name ~ "${q}" || sku ~ "${q}")` : undefined;
  const {
    items: products,
    page,
    setPage,
    totalPages,
    totalItems,
    isFetching,
  } = usePaginatedList<Product>(productsService, ["products", "inv"], {
    sort: "name",
    filter,
  });
  const { data: inventory } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => inventoryService.all({}),
  });

  const rows = useMemo<Row[]>(() => {
    const invByProduct = new Map<string, Inventory>();
    (inventory ?? []).forEach((i) => invByProduct.set(i.product, i));
    return products.map((p) => {
      const inv = invByProduct.get(p.id);
      return { product: p, qty: inv?.qty_on_hand ?? 0, reorder: inv?.reorder_level ?? 0 };
    });
  }, [products, inventory]);

  const submit = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("No product");
      if (mode === "restock")
        return stockService.restock({
          product: target.id,
          qty: Number(qty),
          unit_cost: cost === "" ? undefined : Number(cost),
          sell_price: sellPrice === "" ? undefined : Number(sellPrice),
          note,
        });
      return stockService.adjust({ product: target.id, qty: Number(qty), note });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      setMode(null);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  // Stock lots for the product whose "Lots" view is open.
  const { data: lots } = useQuery({
    queryKey: ["batches", lotsTarget?.id],
    enabled: !!lotsTarget,
    queryFn: () =>
      batchesService.all({
        filter: `product = "${lotsTarget!.id}"`,
        sort: "received_at",
      }),
  });

  const [reorderEdits, setReorderEdits] = useState<Record<string, string>>({});
  const saveReorder = useMutation({
    mutationFn: (v: { product: string; level: number }) =>
      stockService.setReorderLevel({ product: v.product, reorder_level: v.level }),
    onSuccess: (_d, v) => {
      setReorderEdits((e) => {
        const next = { ...e };
        delete next[v.product];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e) => alert(errorMessage(e)),
  });
  const commitReorder = (productId: string) => {
    const raw = reorderEdits[productId];
    if (raw === undefined) return;
    const level = Math.max(0, Number(raw) || 0);
    saveReorder.mutate({ product: productId, level });
  };

  const openModal = (p: Product, m: "restock" | "adjust") => {
    setTarget(p);
    setMode(m);
    setQty("");
    setCost("");
    setSellPrice("");
    setNote("");
    setError("");
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <div className="muted">Stock on hand. Restock or adjust per product.</div>
        </div>
      </div>

      <div className="field" style={{ maxWidth: 320 }}>
        <input
          placeholder="Search products…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th className="num">On hand</th>
              <th className="num">Reorder level</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ product, qty, reorder }) => {
              const low = reorder > 0 && qty <= reorder;
              return (
                <tr key={product.id}>
                  <td><code>{product.sku}</code></td>
                  <td>{product.name}</td>
                  <td className="num">{qty}</td>
                  <td className="num">
                    <input
                      className="pos-num"
                      type="number"
                      min={0}
                      value={reorderEdits[product.id] ?? String(reorder)}
                      onChange={(e) =>
                        setReorderEdits({ ...reorderEdits, [product.id]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitReorder(product.id);
                      }}
                    />
                    {reorderEdits[product.id] !== undefined &&
                      Number(reorderEdits[product.id]) !== reorder && (
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ marginLeft: 6 }}
                          onClick={() => commitReorder(product.id)}
                        >
                          Save
                        </button>
                      )}
                  </td>
                  <td>
                    {qty <= 0 ? (
                      <span className="badge danger">Out of stock</span>
                    ) : low ? (
                      <span className="badge warn">Low</span>
                    ) : (
                      <span className="badge ok">OK</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => openModal(product, "restock")}>
                        Restock
                      </button>
                      <button className="btn btn-sm" onClick={() => openModal(product, "adjust")}>
                        Adjust
                      </button>
                      <button className="btn btn-sm" onClick={() => setLotsTarget(product)}>
                        Lots
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        onChange={setPage}
        isFetching={isFetching}
      />

      <Modal
        title={`${mode === "restock" ? "Restock" : "Adjust"} — ${target?.name ?? ""}`}
        open={mode !== null}
        onClose={() => setMode(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            submit.mutate();
          }}
        >
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field">
            <label>
              {mode === "restock" ? "Quantity to add" : "Signed quantity (e.g. -2 for loss)"}
            </label>
            <input
              type="number"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </div>
          {mode === "restock" && (
            <>
              <div className="field">
                <label>Unit cost (optional)</label>
                <input
                  type="number"
                  step="any"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Selling price for this lot (optional)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="Defaults to the product's price"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="field">
            <label>Note {mode === "adjust" ? "(required)" : ""}</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required={mode === "adjust"}
            />
          </div>
          <div className="inline" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setMode(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={submit.isPending}>
              {submit.isPending ? "Saving…" : "Confirm"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        title={`Stock lots — ${lotsTarget?.name ?? ""}`}
        open={lotsTarget !== null}
        onClose={() => setLotsTarget(null)}
      >
        <div className="muted" style={{ marginBottom: 8 }}>
          Lots are sold oldest-first (FIFO). The first lot with stock remaining
          sets the selling price at the till.
        </div>
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Source</th>
              <th className="num">Remaining</th>
              <th className="num">Received</th>
              <th className="num">Unit cost</th>
              <th className="num">Sell price</th>
            </tr>
          </thead>
          <tbody>
            {(lots ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No stock lots yet.
                </td>
              </tr>
            ) : (
              (lots ?? []).map((b: StockBatch) => (
                <tr key={b.id} className={b.qty_remaining <= 0 ? "muted" : ""}>
                  <td>{fmtDate(b.received_at)}</td>
                  <td>{b.source_type}</td>
                  <td className="num">{b.qty_remaining}</td>
                  <td className="num">{b.qty_received}</td>
                  <td className="num">{fmtMoney(b.unit_cost)}</td>
                  <td className="num">{fmtMoney(b.sell_price)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Modal>
    </div>
  );
}
