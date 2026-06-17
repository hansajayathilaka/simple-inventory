import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { invoiceItemsService, invoicesService } from "../../services";
import { money, dateTime } from "../../lib/format";

export default function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const { data: invoice } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => invoicesService.one(id, "customer,cashier"),
    enabled: !!id,
  });
  const { data: items } = useQuery({
    queryKey: ["invoice_items", id],
    queryFn: () =>
      invoiceItemsService.all({ filter: `invoice = "${id}"`, expand: "product", sort: "created" }),
    enabled: !!id,
  });

  if (!invoice) return <div className="empty">Loading…</div>;

  return (
    <div>
      <div className="page-head no-print">
        <div>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
        <div className="inline">
          <button className="btn btn-primary" onClick={() => window.print()}>
            Print receipt
          </button>
        </div>
      </div>

      <div className="card receipt" style={{ margin: "0 auto" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ marginBottom: 2 }}>Simple Inventory</h2>
          <div className="muted">Sales Receipt</div>
        </div>
        <hr />
        <div>Invoice: <strong>{invoice.number}</strong></div>
        <div>Date: {dateTime(invoice.created)}</div>
        <div>Cashier: {(invoice.expand?.cashier as { name?: string })?.name ?? "—"}</div>
        <div>
          Customer: {(invoice.expand?.customer as { name?: string })?.name ?? "Walk-in"}
        </div>
        <hr />
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
            {(items ?? []).map((it) => (
              <tr key={it.id}>
                <td>{(it.expand?.product as { name?: string })?.name ?? "—"}</td>
                <td className="num">{it.qty}</td>
                <td className="num">{money(it.unit_price)}</td>
                <td className="num">{money(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />
        <table>
          <tbody>
            <tr><td>Subtotal</td><td className="num">{money(invoice.subtotal)}</td></tr>
            <tr><td>Discount</td><td className="num">-{money(invoice.discount_total)}</td></tr>
            <tr><td>Tax</td><td className="num">{money(invoice.tax_total)}</td></tr>
            <tr><td><strong>Total</strong></td><td className="num"><strong>{money(invoice.grand_total)}</strong></td></tr>
          </tbody>
        </table>
        <hr />
        <div>Payment: {invoice.payment_method ?? "—"}</div>
        <div>Status: {invoice.status.replace("_", " ")}</div>
        <div style={{ textAlign: "center", marginTop: 10 }} className="muted">
          Thank you!
        </div>
      </div>
    </div>
  );
}
