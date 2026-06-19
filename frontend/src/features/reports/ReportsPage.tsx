import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  categoriesService,
  inventoryService,
  invoiceItemsService,
  invoicesService,
  productsService,
  returnItemsService,
} from "../../services";
import { money } from "../../lib/format";

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const { data: invoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => invoicesService.all({ sort: "-created" }),
  });
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsService.all({ sort: "name" }),
  });
  const { data: inventory } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => inventoryService.all({}),
  });
  const { data: invoiceItems } = useQuery({
    queryKey: ["invoice_items"],
    queryFn: () => invoiceItemsService.all({}),
  });
  const { data: returnItems } = useQuery({
    queryKey: ["return_items"],
    queryFn: () => returnItemsService.all({}),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesService.all({}),
  });

  const sales = useMemo(() => {
    const start = new Date(from + "T00:00:00").getTime();
    const end = new Date(to + "T23:59:59").getTime();
    const inRange = (invoices ?? []).filter((i) => {
      if (i.status === "draft" || i.status === "void") return false;
      const t = new Date(i.created).getTime();
      return t >= start && t <= end;
    });
    const total = inRange.reduce((s, i) => s + (i.grand_total || 0), 0);
    const tax = inRange.reduce((s, i) => s + (i.tax_total || 0), 0);
    const discount = inRange.reduce((s, i) => s + (i.discount_total || 0), 0);
    return { count: inRange.length, total, tax, discount, list: inRange };
  }, [invoices, from, to]);

  const stock = useMemo(() => {
    const invMap = new Map(inventory?.map((i) => [i.product, i]) ?? []);
    const valued = (products ?? []).map((p) => {
      const inv = invMap.get(p.id);
      const qty = inv?.qty_on_hand ?? 0;
      return {
        product: p,
        qty,
        reorder: inv?.reorder_level ?? 0,
        value: qty * (p.cost_price ?? 0),
      };
    });
    const totalValue = valued.reduce((s, v) => s + v.value, 0);
    const low = valued.filter((v) => v.reorder > 0 && v.qty <= v.reorder);
    return { valued, totalValue, low };
  }, [products, inventory]);

  // Profit = revenue (ex-tax) − cost of goods sold, using the per-lot cost
  // captured on each invoice line (invoice_items.cost_total). Returned units are
  // netted out against their original sale line, so a refunded item contributes
  // neither revenue nor cost.
  const profit = useMemo(() => {
    const start = new Date(from + "T00:00:00").getTime();
    const end = new Date(to + "T23:59:59").getTime();
    const invInRange = new Set(
      (invoices ?? [])
        .filter((i) => {
          if (i.status === "draft" || i.status === "void") return false;
          const t = new Date(i.created).getTime();
          return t >= start && t <= end;
        })
        .map((i) => i.id)
    );
    // returned qty per original invoice_item
    const retQty = new Map<string, number>();
    (returnItems ?? []).forEach((r) => {
      if (!r.invoice_item) return;
      retQty.set(r.invoice_item, (retQty.get(r.invoice_item) ?? 0) + (r.qty || 0));
    });
    const prodMap = new Map((products ?? []).map((p) => [p.id, p]));
    const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

    let revenue = 0;
    let cost = 0;
    const byProd = new Map<string, { name: string; sku: string; qty: number; revenue: number; cost: number }>();
    const byCat = new Map<string, { name: string; revenue: number; cost: number }>();

    (invoiceItems ?? []).forEach((it) => {
      if (!invInRange.has(it.invoice)) return;
      const qty = it.qty || 0;
      if (qty <= 0) return;
      const kept = Math.max(0, qty - (retQty.get(it.id) ?? 0));
      if (kept <= 0) return;
      const lineNet = qty * (it.unit_price || 0) - (it.discount || 0);
      const r = (lineNet / qty) * kept;
      const c = ((it.cost_total || 0) / qty) * kept;
      revenue += r;
      cost += c;

      const p = prodMap.get(it.product);
      const pe =
        byProd.get(it.product) ??
        { name: p?.name ?? "—", sku: p?.sku ?? "", qty: 0, revenue: 0, cost: 0 };
      pe.qty += kept;
      pe.revenue += r;
      pe.cost += c;
      byProd.set(it.product, pe);

      const cn = p?.category ? catName.get(p.category) ?? "—" : "Uncategorized";
      const ce = byCat.get(cn) ?? { name: cn, revenue: 0, cost: 0 };
      ce.revenue += r;
      ce.cost += c;
      byCat.set(cn, ce);
    });

    const products_ = [...byProd.values()]
      .map((e) => ({ ...e, profit: e.revenue - e.cost }))
      .sort((a, b) => b.profit - a.profit);
    const cats = [...byCat.values()]
      .map((e) => ({ ...e, profit: e.revenue - e.cost }))
      .sort((a, b) => b.profit - a.profit);
    const grossProfit = revenue - cost;
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    return { revenue, cost, grossProfit, margin, products: products_, cats };
  }, [invoices, invoiceItems, returnItems, products, categories, from, to]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <div className="muted">Sales, stock valuation and low-stock.</div>
        </div>
      </div>

      <div className="card">
        <div className="inline">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button
            className="btn"
            onClick={() =>
              download(
                `sales_${from}_${to}.csv`,
                toCsv([
                  ["Number", "Date", "Subtotal", "Discount", "Tax", "Total", "Status"],
                  ...sales.list.map((i) => [
                    i.number,
                    i.created,
                    i.subtotal,
                    i.discount_total,
                    i.tax_total,
                    i.grand_total,
                    i.status,
                  ]),
                ])
              )
            }
          >
            Export sales CSV
          </button>
        </div>
      </div>

      <div className="grid grid-4">
        <div className="stat">
          <div className="lbl">Sales total</div>
          <div className="val">{money(sales.total)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Invoices</div>
          <div className="val">{sales.count}</div>
        </div>
        <div className="stat">
          <div className="lbl">Tax collected</div>
          <div className="val">{money(sales.tax)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Discounts given</div>
          <div className="val">{money(sales.discount)}</div>
        </div>
      </div>

      <div className="page-head" style={{ marginTop: 24 }}>
        <h2>Profit (net of returns)</h2>
        <button
          className="btn btn-sm"
          onClick={() =>
            download(
              `profit_by_product_${from}_${to}.csv`,
              toCsv([
                ["SKU", "Product", "Qty sold", "Revenue", "Cost", "Profit", "Margin %"],
                ...profit.products.map((p) => [
                  p.sku,
                  p.name,
                  p.qty,
                  p.revenue.toFixed(2),
                  p.cost.toFixed(2),
                  p.profit.toFixed(2),
                  p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : "0",
                ]),
              ])
            )
          }
        >
          Export profit CSV
        </button>
      </div>
      <div className="grid grid-4">
        <div className="stat">
          <div className="lbl">Revenue (ex-tax)</div>
          <div className="val">{money(profit.revenue)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Cost of goods</div>
          <div className="val">{money(profit.cost)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Gross profit</div>
          <div className="val">{money(profit.grossProfit)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Margin</div>
          <div className="val">{profit.margin.toFixed(1)}%</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 18px 0" }}>
            <h2>Profit by product</h2>
          </div>
          {profit.products.length === 0 ? (
            <div className="empty">No sales in range.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th className="num">Revenue</th>
                  <th className="num">Profit</th>
                  <th className="num">Margin</th>
                </tr>
              </thead>
              <tbody>
                {profit.products.slice(0, 15).map((p) => (
                  <tr key={p.sku}>
                    <td>{p.name}</td>
                    <td className="num">{p.qty}</td>
                    <td className="num">{money(p.revenue)}</td>
                    <td className="num">{money(p.profit)}</td>
                    <td className="num">
                      {p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(0) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 18px 0" }}>
            <h2>Profit by category</h2>
          </div>
          {profit.cats.length === 0 ? (
            <div className="empty">No sales in range.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Revenue</th>
                  <th className="num">Profit</th>
                  <th className="num">Margin</th>
                </tr>
              </thead>
              <tbody>
                {profit.cats.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="num">{money(c.revenue)}</td>
                    <td className="num">{money(c.profit)}</td>
                    <td className="num">
                      {c.revenue > 0 ? ((c.profit / c.revenue) * 100).toFixed(0) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="page-head">
            <h2>Stock valuation</h2>
            <button
              className="btn btn-sm"
              onClick={() =>
                download(
                  "stock_valuation.csv",
                  toCsv([
                    ["SKU", "Product", "Qty", "Cost", "Value"],
                    ...stock.valued.map((v) => [
                      v.product.sku,
                      v.product.name,
                      v.qty,
                      v.product.cost_price ?? 0,
                      v.value,
                    ]),
                  ])
                )
              }
            >
              Export
            </button>
          </div>
          <p>
            Total inventory value: <strong>{money(stock.totalValue)}</strong>
          </p>
        </div>

        <div className="card">
          <h2>Low stock ({stock.low.length})</h2>
          {stock.low.length === 0 ? (
            <div className="empty">All good.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">On hand</th>
                  <th className="num">Reorder</th>
                </tr>
              </thead>
              <tbody>
                {stock.low.map((v) => (
                  <tr key={v.product.id}>
                    <td>{v.product.name}</td>
                    <td className="num">{v.qty}</td>
                    <td className="num">{v.reorder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
