import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useSettings } from "../../settings/SettingsContext";
import {
  attributesService,
  batchesService,
  categoriesService,
  inventoryService,
  lookupService,
  posService,
  productsService,
} from "../../services";
import type {
  AttributeDefinition,
  CheckoutResult,
  Product,
  StockBatch,
} from "../../types";
import { errorMessage } from "../../lib/errors";
import { money } from "../../lib/format";
import { buildReceiptHTML, type ReceiptLine } from "../../lib/receipt";
import { printHTML } from "../../lib/print";
import ProductPanel from "./ProductPanel";
import BillSummary from "./BillSummary";
import CheckoutPanel, { type Payment } from "./CheckoutPanel";
import type { CartLine, DetailRow, EditSeed } from "./types";

const PAYMENTS: Payment[] = ["cash", "card", "other"];

// Redesigned, keyboard-friendly POS: a left work area (search → product detail →
// lot picker → line editor) and a right summary (read-only bill on top, totals +
// checkout on the bottom). Lot selection sets the price only; the server still
// draws stock/cost FIFO at checkout.
export default function PosScreen() {
  const { user } = useAuth();
  const { settings, currency } = useSettings();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [seed, setSeed] = useState<EditSeed | null>(null);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [tendered, setTendered] = useState("");
  const [payment, setPayment] = useState<Payment>("cash");
  const [customer, setCustomer] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CheckoutResult | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const cur = useCallback((n: number) => currency + money(n), [currency]);

  // --- data ---
  const { data: products } = useQuery({
    queryKey: ["products", "active"],
    queryFn: () => productsService.all({ sort: "name", filter: "is_active = true" }),
  });
  const { data: inventory } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => inventoryService.all({}),
  });
  const { data: openLots } = useQuery({
    queryKey: ["batches", "open"],
    queryFn: () =>
      batchesService.all({ filter: "qty_remaining > 0", sort: "received_at" }),
  });
  const { data: attrDefs } = useQuery({
    queryKey: ["attribute_definitions"],
    queryFn: () => attributesService.all({ sort: "sort_order" }),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesService.all({}),
  });

  // relation attributes point at lookup collections; load each so we can resolve
  // stored ids to human names (for both the detail card and search).
  const relationTargets = useMemo(() => {
    const set = new Set<string>();
    (attrDefs ?? []).forEach((d: AttributeDefinition) => {
      if (d.type === "relation" && d.target_collection) set.add(d.target_collection);
    });
    return Array.from(set);
  }, [attrDefs]);

  const { data: lookupMaps } = useQuery({
    queryKey: ["pos-lookup-maps", relationTargets.join(",")],
    enabled: !!attrDefs,
    queryFn: async () => {
      const maps = new Map<string, Map<string, string>>();
      for (const name of relationTargets) {
        try {
          const items = await lookupService(name).all({});
          maps.set(name, new Map(items.map((i) => [i.id, i.name])));
        } catch {
          maps.set(name, new Map());
        }
      }
      return maps;
    },
  });

  const qtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    (inventory ?? []).forEach((i) => m.set(i.product, i.qty_on_hand));
    return m;
  }, [inventory]);

  const lotsByProduct = useMemo(() => {
    const m = new Map<string, StockBatch[]>();
    (openLots ?? []).forEach((b) => {
      const arr = m.get(b.product) ?? [];
      arr.push(b);
      m.set(b.product, arr);
    });
    return m;
  }, [openLots]);

  const categoryName = useMemo(() => {
    const m = new Map<string, string>();
    (categories ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  // resolve a stored attribute value to a display string
  const resolveAttr = useCallback(
    (def: AttributeDefinition, raw: unknown): string => {
      if (raw == null || raw === "") return "";
      if (def.type === "boolean") return raw ? "Yes" : "No";
      if (def.type === "relation") {
        const map = lookupMaps?.get(def.target_collection ?? "");
        const ids = Array.isArray(raw) ? (raw as string[]) : [String(raw)];
        return ids.map((id) => map?.get(id) ?? id).join(", ");
      }
      if (Array.isArray(raw)) return (raw as unknown[]).join(", ");
      return String(raw);
    },
    [lookupMaps]
  );

  const detailRowsFor = useCallback(
    (p: Product): DetailRow[] => {
      const rows: DetailRow[] = [];
      rows.push({ label: "Code (SKU)", value: p.sku });
      if (p.barcode) rows.push({ label: "Barcode", value: p.barcode });
      if (p.category)
        rows.push({
          label: "Category",
          value: categoryName.get(p.category) ?? p.category,
        });
      (attrDefs ?? []).forEach((def) => {
        const val = resolveAttr(def, p.attributes?.[def.key]);
        if (val) rows.push({ label: def.label, value: val });
      });
      rows.push({ label: "Tax", value: `${p.tax_rate ?? 0}%` });
      return rows;
    },
    [attrDefs, categoryName, resolveAttr]
  );

  // per-product lowercased search blob: name, codes, category, attribute values
  const searchIndex = useMemo(() => {
    const m = new Map<string, string>();
    (products ?? []).forEach((p) => {
      const parts = [p.name, p.sku, p.barcode ?? ""];
      if (p.category) parts.push(categoryName.get(p.category) ?? "");
      (attrDefs ?? []).forEach((def) =>
        parts.push(resolveAttr(def, p.attributes?.[def.key]))
      );
      m.set(p.id, parts.join(" ").toLowerCase());
    });
    return m;
  }, [products, categoryName, attrDefs, resolveAttr]);

  const searchText = useCallback(
    (p: Product) => searchIndex.get(p.id) ?? `${p.name} ${p.sku}`.toLowerCase(),
    [searchIndex]
  );

  // --- totals ---
  const totals = useMemo(() => {
    let subtotal = 0,
      discount = 0,
      tax = 0;
    for (const l of cart) {
      const gross = l.qty * l.unit_price;
      const net = Math.max(0, gross - l.discount);
      subtotal += gross;
      discount += l.discount;
      tax += (net * (l.product.tax_rate ?? 0)) / 100;
    }
    discount += invoiceDiscount;
    return { subtotal, discount, tax, grand: Math.max(0, subtotal - discount + tax) };
  }, [cart, invoiceDiscount]);

  const changeDue = tendered === "" ? 0 : Number(tendered) - totals.grand;

  // --- cart ops ---
  const submitLine = useCallback(
    (line: CartLine) => {
      setCart((prev) => {
        if (editingIndex != null && editingIndex < prev.length) {
          const next = [...prev];
          next[editingIndex] = line;
          setSelected(editingIndex);
          return next;
        }
        setSelected(prev.length);
        return [...prev, line];
      });
      setEditingIndex(null);
    },
    [editingIndex]
  );

  const loadForEdit = useCallback(
    (i: number) => {
      const line = cart[i];
      if (!line) return;
      setEditingIndex(i);
      setSelected(i);
      setSeed({ line, nonce: Date.now() });
    },
    [cart]
  );

  const removeLine = useCallback((i: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== i));
    setSelected((s) => (s >= i && s > 0 ? s - 1 : s));
    setEditingIndex((e) => (e === i ? null : e));
  }, []);

  const exit = useCallback(() => navigate("/"), [navigate]);

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  const doCheckout = useCallback(async () => {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await posService.checkout({
        customer: customer || undefined,
        payment_method: payment,
        discount_total: invoiceDiscount,
        amount_tendered:
          payment === "cash" && tendered !== "" ? Number(tendered) : undefined,
        items: cart.map((l) => ({
          product: l.product.id,
          qty: l.qty,
          unit_price: l.unit_price,
          discount: l.discount,
        })),
      });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["batches"] });

      const lines: ReceiptLine[] = cart.map((l) => ({
        name: l.product.name,
        qty: l.qty,
        unit_price: l.unit_price,
        line_total: Math.max(0, l.qty * l.unit_price - l.discount),
      }));
      const isCash = payment === "cash" && tendered !== "";
      const html = buildReceiptHTML(settings, {
        number: res.number,
        date: new Date().toLocaleString(),
        cashier: user?.name,
        customer: customerName || undefined,
        lines,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: res.grand_total,
        payment,
        tendered: isCash ? Number(tendered) : undefined,
        change: isCash ? res.change_given : undefined,
      });
      printHTML(html, {
        silent: !!settings?.printers?.silent,
        deviceName: settings?.printers?.receiptPrinter || undefined,
      }).catch(() => {});

      setDone(res);
      setCart([]);
      setInvoiceDiscount(0);
      setTendered("");
      setCustomer("");
      setCustomerName("");
      setSelected(0);
      setEditingIndex(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [
    cart,
    busy,
    customer,
    customerName,
    payment,
    invoiceDiscount,
    tendered,
    settings,
    user,
    totals,
    qc,
  ]);

  const newSale = useCallback(() => {
    setDone(null);
    setError("");
    setTimeout(focusSearch, 0);
  }, [focusSearch]);

  // global shortcuts (work regardless of focus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) {
        if (e.key === "Enter") {
          e.preventDefault();
          newSale();
        }
        return;
      }
      switch (e.key) {
        case "F1":
          e.preventDefault();
          setShowHelp((s) => !s);
          break;
        case "F2":
          e.preventDefault();
          focusSearch();
          break;
        case "F7":
          e.preventDefault();
          setPayment((p) => PAYMENTS[(PAYMENTS.indexOf(p) + 1) % PAYMENTS.length]);
          break;
        case "F9":
          e.preventDefault();
          doCheckout();
          break;
        case "PageDown":
          if (cart.length) {
            e.preventDefault();
            setSelected((s) => Math.min(cart.length - 1, s + 1));
            summaryRef.current?.focus();
          }
          break;
        case "PageUp":
          if (cart.length) {
            e.preventDefault();
            setSelected((s) => Math.max(0, s - 1));
            summaryRef.current?.focus();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, cart.length, focusSearch, doCheckout, newSale]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  if (done) {
    return (
      <div className="pos-screen">
        <div className="pos-done">
          <h1>✓ Sale complete</h1>
          <p>
            Invoice <strong>{done.number}</strong> — total{" "}
            <strong>{cur(done.grand_total)}</strong>
          </p>
          {done.change_given != null && done.change_given > 0 && (
            <p className="pos-change-big">Change due: {cur(done.change_given)}</p>
          )}
          <p className="muted">Receipt sent to printer.</p>
          <div className="inline" style={{ justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={newSale}>
              New sale (Enter)
            </button>
            <button className="btn" onClick={() => navigate(`/invoices/${done.id}`)}>
              View invoice
            </button>
            <button className="btn btn-ghost" onClick={exit}>
              Exit POS
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-screen">
      <header className="pos-header">
        <div className="brand">▶ POS — {settings?.company_name ?? "Simple Inventory"}</div>
        <div className="inline">
          <span className="badge">Cashier: {user?.name}</span>
          <span className="badge">Pay: {payment} (F7)</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowHelp((s) => !s)}>
            Shortcuts (F1)
          </button>
          <button className="btn btn-sm" onClick={exit}>
            Exit
          </button>
        </div>
      </header>

      <div className="pos-body">
        <ProductPanel
          products={products ?? []}
          searchText={searchText}
          qtyByProduct={qtyByProduct}
          lotsByProduct={lotsByProduct}
          detailRowsFor={detailRowsFor}
          cur={cur}
          isEditing={editingIndex != null}
          seed={seed}
          searchInputRef={searchRef}
          onProductPicked={() => setEditingIndex(null)}
          onSubmit={submitLine}
        />

        <section className="pos-right">
          {error && <div className="alert alert-error">{error}</div>}
          <BillSummary
            cart={cart}
            selected={selected}
            containerRef={summaryRef}
            cur={cur}
            onSelect={setSelected}
            onEdit={loadForEdit}
            onRemove={removeLine}
          />
          <CheckoutPanel
            totals={totals}
            invoiceDiscount={invoiceDiscount}
            setInvoiceDiscount={setInvoiceDiscount}
            customer={customer}
            onCustomer={(id, name) => {
              setCustomer(id);
              setCustomerName(name);
            }}
            payment={payment}
            setPayment={setPayment}
            tendered={tendered}
            setTendered={setTendered}
            changeDue={changeDue}
            busy={busy}
            canCharge={cart.length > 0}
            onCharge={doCheckout}
            cur={cur}
          />
        </section>
      </div>

      <footer className="pos-footer">
        <span><b>F2</b> search</span>
        <span><b>Enter</b> add / edit</span>
        <span><b>PgUp/PgDn</b> select line</span>
        <span><b>Del</b> remove</span>
        <span><b>F7</b> payment</span>
        <span><b>F9</b> charge</span>
      </footer>

      {showHelp && (
        <div className="modal-backdrop" onMouseDown={() => setShowHelp(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Keyboard shortcuts</h3>
              <button className="btn btn-ghost" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="modal-body">
              <table>
                <tbody>
                  <tr><td><b>F2 / type</b></td><td>Focus search; find by name, code, barcode, category, make…</td></tr>
                  <tr><td><b>↑ / ↓</b></td><td>Move through search results</td></tr>
                  <tr><td><b>Enter</b> (search)</td><td>Scan match adds instantly; otherwise opens the line editor</td></tr>
                  <tr><td><b>Enter</b> (editor)</td><td>Add the line to the bill (or Update when editing)</td></tr>
                  <tr><td><b>PgUp / PgDn</b></td><td>Select a line in the bill summary</td></tr>
                  <tr><td><b>Enter</b> (summary)</td><td>Load the selected line back into the editor</td></tr>
                  <tr><td><b>Delete</b></td><td>Remove the selected line</td></tr>
                  <tr><td><b>F7</b></td><td>Cycle payment method</td></tr>
                  <tr><td><b>F9</b></td><td>Charge / proceed with the bill</td></tr>
                  <tr><td><b>F1</b></td><td>Toggle this help</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
