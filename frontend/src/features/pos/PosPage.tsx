import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  customersService,
  posService,
  productsService,
} from "../../services";
import type { CheckoutResult, Product } from "../../types";
import { errorMessage } from "../../lib/errors";
import { money } from "../../lib/format";

interface CartLine {
  product: Product;
  qty: number;
  unit_price: number;
  discount: number;
}

export default function PosPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [payment, setPayment] = useState<"cash" | "card" | "other">("cash");
  const [invoiceDiscount, setInvoiceDiscount] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<CheckoutResult | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: products } = useQuery({
    queryKey: ["products", "active"],
    queryFn: () => productsService.all({ sort: "name", filter: "is_active = true" }),
  });
  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersService.all({ sort: "name" }),
  });

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (products ?? [])
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [products, search]);

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { product: p, qty: 1, unit_price: p.sell_price, discount: 0 }];
    });
    setSearch("");
    searchRef.current?.focus();
  };

  // Barcode scanners type fast then press Enter — match exact barcode/SKU.
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = search.trim().toLowerCase();
    const exact = (products ?? []).find(
      (p) => (p.barcode ?? "").toLowerCase() === q || p.sku.toLowerCase() === q
    );
    if (exact) addToCart(exact);
    else if (results.length === 1) addToCart(results[0]);
  };

  const updateLine = (id: string, patch: Partial<CartLine>) =>
    setCart((prev) =>
      prev.map((l) => (l.product.id === id ? { ...l, ...patch } : l))
    );
  const removeLine = (id: string) =>
    setCart((prev) => prev.filter((l) => l.product.id !== id));

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
    const invDisc = Number(invoiceDiscount) || 0;
    discount += invDisc;
    const grand = Math.max(0, subtotal - discount + tax);
    return { subtotal, discount, tax, grand };
  }, [cart, invoiceDiscount]);

  const checkout = useMutation({
    mutationFn: () =>
      posService.checkout({
        customer: customer || undefined,
        payment_method: payment,
        discount_total: Number(invoiceDiscount) || 0,
        items: cart.map((l) => ({
          product: l.product.id,
          qty: l.qty,
          unit_price: l.unit_price,
          discount: l.discount,
        })),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setDone(res);
      setCart([]);
      setInvoiceDiscount("");
      setCustomer("");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (done) {
    return (
      <div className="card" style={{ maxWidth: 420 }}>
        <div className="alert alert-ok">
          Sale completed — invoice <strong>{done.number}</strong>.
        </div>
        <p>Total charged: <strong>{money(done.grand_total)}</strong></p>
        <div className="inline">
          <button className="btn btn-primary" onClick={() => navigate(`/invoices/${done.id}`)}>
            View / print receipt
          </button>
          <button className="btn" onClick={() => setDone(null)}>
            New sale
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pos">
      <div>
        <h1>Point of Sale</h1>
        <div className="field">
          <input
            ref={searchRef}
            autoFocus
            placeholder="Scan barcode or search product, then Enter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
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
                    <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => addToCart(p)}>
                      <td><code>{p.sku}</code></td>
                      <td>{p.name}</td>
                      <td className="num">{money(p.sell_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="card pos-cart">
        <h2>Cart</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="cart-lines">
          {cart.length === 0 ? (
            <div className="empty">Cart is empty. Scan or search to add items.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: 64 }}>Qty</th>
                  <th style={{ width: 80 }}>Price</th>
                  <th style={{ width: 80 }}>Disc.</th>
                  <th className="num">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => {
                  const lineTotal = Math.max(0, l.qty * l.unit_price - l.discount);
                  return (
                    <tr key={l.product.id}>
                      <td>{l.product.name}</td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={l.qty}
                          onChange={(e) =>
                            updateLine(l.product.id, { qty: Math.max(1, Number(e.target.value)) })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={l.unit_price}
                          onChange={(e) =>
                            updateLine(l.product.id, { unit_price: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={l.discount}
                          onChange={(e) =>
                            updateLine(l.product.id, { discount: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="num">{money(lineTotal)}</td>
                      <td>
                        <button className="btn btn-sm btn-ghost" onClick={() => removeLine(l.product.id)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <table className="totals" style={{ marginTop: 12 }}>
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td className="num">{money(totals.subtotal)}</td>
            </tr>
            <tr>
              <td>
                Discount{" "}
                <input
                  type="number"
                  step="any"
                  placeholder="invoice disc."
                  value={invoiceDiscount}
                  onChange={(e) => setInvoiceDiscount(e.target.value)}
                  style={{ width: 110, display: "inline-block", marginLeft: 8 }}
                />
              </td>
              <td className="num">-{money(totals.discount)}</td>
            </tr>
            <tr>
              <td>Tax</td>
              <td className="num">{money(totals.tax)}</td>
            </tr>
            <tr>
              <td><strong>Grand total</strong></td>
              <td className="num"><strong>{money(totals.grand)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Customer (optional)</label>
            <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">Walk-in</option>
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Payment</label>
            <select value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={cart.length === 0 || checkout.isPending}
          onClick={() => {
            setError("");
            checkout.mutate();
          }}
        >
          {checkout.isPending ? "Processing…" : `Charge ${money(totals.grand)}`}
        </button>
      </div>
    </div>
  );
}
