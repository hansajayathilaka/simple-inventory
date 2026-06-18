import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useSettings } from "../../settings/SettingsContext";
import { customersService, posService, productsService } from "../../services";
import type { CheckoutResult, Product } from "../../types";
import { errorMessage } from "../../lib/errors";
import { buildReceiptHTML, type ReceiptLine } from "../../lib/receipt";
import { printHTML } from "../../lib/print";

interface CartLine {
  product: Product;
  qty: number;
  unit_price: number;
  discount: number;
}

const PAYMENTS = ["cash", "card", "other"] as const;

// Fully isolated, keyboard-first POS. The scan/search box stays focused; all
// actions have shortcuts so the till can be run without a mouse.
export default function PosScreen() {
  const { user } = useAuth();
  const { settings, currency } = useSettings();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState(0);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [payment, setPayment] = useState<(typeof PAYMENTS)[number]>("cash");
  const [customer, setCustomer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CheckoutResult | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const cur = (n: number) => currency + (Number(n) || 0).toFixed(2);

  const { data: products } = useQuery({
    queryKey: ["products", "active"],
    queryFn: () => productsService.all({ sort: "name", filter: "is_active = true" }),
  });
  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersService.all({ sort: "name" }),
  });

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (products ?? [])
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [products, query]);

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

  const focusSearch = useCallback(() => {
    setQuery("");
    setHighlight(0);
    searchRef.current?.focus();
  }, []);

  const addToCart = useCallback((p: Product) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        setSelected(i);
        return next;
      }
      setSelected(prev.length);
      return [...prev, { product: p, qty: 1, unit_price: p.sell_price, discount: 0 }];
    });
    setQuery("");
    setHighlight(0);
  }, []);

  const changeQty = useCallback((delta: number) => {
    setCart((prev) =>
      prev
        .map((l, i) => (i === selected ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }, [selected]);

  const removeSelected = useCallback(() => {
    setCart((prev) => prev.filter((_, i) => i !== selected));
    setSelected((s) => Math.max(0, s - 1));
  }, [selected]);

  const exit = useCallback(() => navigate("/"), [navigate]);

  const doCheckout = useCallback(async () => {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await posService.checkout({
        customer: customer || undefined,
        payment_method: payment,
        discount_total: invoiceDiscount,
        items: cart.map((l) => ({
          product: l.product.id,
          qty: l.qty,
          unit_price: l.unit_price,
          discount: l.discount,
        })),
      });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });

      // auto-print receipt
      const lines: ReceiptLine[] = cart.map((l) => ({
        name: l.product.name,
        qty: l.qty,
        unit_price: l.unit_price,
        line_total: Math.max(0, l.qty * l.unit_price - l.discount),
      }));
      const html = buildReceiptHTML(settings, {
        number: res.number,
        date: new Date().toLocaleString(),
        cashier: user?.name,
        customer: customers?.find((c) => c.id === customer)?.name,
        lines,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: res.grand_total,
        payment,
      });
      printHTML(html, {
        silent: !!settings?.printers?.silent,
        deviceName: settings?.printers?.receiptPrinter || undefined,
      }).catch(() => {});

      setDone(res);
      setCart([]);
      setInvoiceDiscount(0);
      setCustomer("");
      setSelected(0);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [cart, busy, customer, payment, invoiceDiscount, settings, user, customers, totals, qc]);

  const newSale = useCallback(() => {
    setDone(null);
    setError("");
    setTimeout(focusSearch, 0);
  }, [focusSearch]);

  // Global function-key shortcuts (work regardless of focus).
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, focusSearch, doCheckout, newSale]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Search-box key handling (navigation + quantity when idle).
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (query) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(results.length - 1, h + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const q = query.trim().toLowerCase();
        const exact = (products ?? []).find(
          (p) => (p.barcode ?? "").toLowerCase() === q || p.sku.toLowerCase() === q
        );
        if (exact) addToCart(exact);
        else if (results[highlight]) addToCart(results[highlight]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setQuery("");
      }
      return;
    }
    // query empty → operate on the cart
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(cart.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      changeQty(1);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      changeQty(-1);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeSelected();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (cart.length === 0) exit();
      else if (confirm("Clear the current sale?")) {
        setCart([]);
        setSelected(0);
      }
    }
  };

  if (done) {
    return (
      <div className="pos-screen">
        <div className="pos-done">
          <h1>✓ Sale complete</h1>
          <p>
            Invoice <strong>{done.number}</strong> — total{" "}
            <strong>{cur(done.grand_total)}</strong>
          </p>
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
            Exit (Esc)
          </button>
        </div>
      </header>

      <div className="pos-body">
        <section className="pos-left">
          <input
            ref={searchRef}
            className="pos-search"
            placeholder="Scan barcode or type to search…  (Enter adds)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onSearchKey}
            onBlur={(e) => {
              // keep keyboard flow: refocus only when focus was lost to nothing
              // (clicking empty space), not when moving to another control.
              if (!e.relatedTarget) setTimeout(() => searchRef.current?.focus(), 0);
            }}
          />
          {query && (
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
                      addToCart(p);
                    }}
                  >
                    <span>
                      <code>{p.sku}</code> {p.name}
                    </span>
                    <span>{cur(p.sell_price)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        <section className="pos-right">
          {error && <div className="alert alert-error">{error}</div>}
          <div className="pos-cart">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty">
                      Scan or search to add items.
                    </td>
                  </tr>
                ) : (
                  cart.map((l, i) => (
                    <tr
                      key={l.product.id}
                      className={i === selected ? "row-selected" : ""}
                      onMouseDown={() => setSelected(i)}
                    >
                      <td>{l.product.name}</td>
                      <td className="num">{l.qty}</td>
                      <td className="num">{cur(l.unit_price)}</td>
                      <td className="num">
                        {cur(Math.max(0, l.qty * l.unit_price - l.discount))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pos-totals">
            <div className="row">
              <span>Subtotal</span>
              <span>{cur(totals.subtotal)}</span>
            </div>
            <div className="row">
              <span>Discount</span>
              <span>-{cur(totals.discount)}</span>
            </div>
            <div className="row">
              <span>Tax</span>
              <span>{cur(totals.tax)}</span>
            </div>
            <div className="row grand">
              <span>TOTAL</span>
              <span>{cur(totals.grand)}</span>
            </div>
          </div>

          <div className="pos-pay">
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              tabIndex={-1}
            >
              <option value="">Walk-in customer</option>
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary pos-charge"
              disabled={cart.length === 0 || busy}
              onClick={doCheckout}
            >
              {busy ? "…" : `Charge ${cur(totals.grand)} (F9)`}
            </button>
          </div>
        </section>
      </div>

      <footer className="pos-footer">
        <span><b>Enter</b> add</span>
        <span><b>↑/↓</b> move</span>
        <span><b>+/−</b> qty</span>
        <span><b>Del</b> remove</span>
        <span><b>F2</b> search</span>
        <span><b>F7</b> payment</span>
        <span><b>F9</b> charge</span>
        <span><b>Esc</b> clear/exit</span>
      </footer>

      {showHelp && (
        <div className="modal-backdrop" onMouseDown={() => setShowHelp(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Keyboard shortcuts</h3>
              <button className="btn btn-ghost" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="modal-body">
              <table>
                <tbody>
                  <tr><td><b>Type / scan</b></td><td>Search or add by barcode</td></tr>
                  <tr><td><b>Enter</b></td><td>Add highlighted / scanned item</td></tr>
                  <tr><td><b>↑ / ↓</b></td><td>Move through results or cart</td></tr>
                  <tr><td><b>+ / −</b></td><td>Increase / decrease selected qty (search empty)</td></tr>
                  <tr><td><b>Delete</b></td><td>Remove selected line (search empty)</td></tr>
                  <tr><td><b>F2</b></td><td>Focus the search box</td></tr>
                  <tr><td><b>F7</b></td><td>Cycle payment method</td></tr>
                  <tr><td><b>F9</b></td><td>Charge / checkout</td></tr>
                  <tr><td><b>Esc</b></td><td>Clear sale, or exit POS when empty</td></tr>
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
