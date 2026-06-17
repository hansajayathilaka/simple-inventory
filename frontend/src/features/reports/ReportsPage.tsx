import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  inventoryService,
  invoicesService,
  productsService,
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
