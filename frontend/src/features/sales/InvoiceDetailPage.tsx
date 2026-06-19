import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { invoiceItemsService, invoicesService } from "../../services";
import { useSettings } from "../../settings/SettingsContext";
import { money, dateTime } from "../../lib/format";
import { buildReceiptHTML } from "../../lib/receipt";
import { printHTML } from "../../lib/print";

export default function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();

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

  const printReceipt = () => {
    const html = buildReceiptHTML(settings, {
      number: invoice.number,
      date: dateTime(invoice.created),
      cashier: (invoice.expand?.cashier as { name?: string })?.name,
      customer: (invoice.expand?.customer as { name?: string })?.name,
      lines: (items ?? []).map((it) => ({
        name: (it.expand?.product as { name?: string })?.name ?? "—",
        qty: it.qty,
        unit_price: it.unit_price,
        line_total: it.line_total,
      })),
      subtotal: invoice.subtotal,
      discount: invoice.discount_total,
      tax: invoice.tax_total,
      total: invoice.grand_total,
      payment: invoice.payment_method,
      tendered: invoice.amount_tendered,
      change: invoice.change_given,
    });
    printHTML(html, {
      silent: !!settings?.printers?.silent,
      deviceName: settings?.printers?.receiptPrinter || undefined,
    }).catch((e) => alert(String(e)));
  };

  return (
    <div>
      <div className="page-head no-print">
        <div>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
        <div className="inline">
          <button className="btn btn-primary" onClick={printReceipt}>
            Print receipt
          </button>
        </div>
      </div>

      <div className="card receipt" style={{ margin: "0 auto" }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ marginBottom: 2 }}>{settings?.company_name ?? "Simple Inventory"}</h2>
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
            {invoice.amount_tendered != null && (
              <>
                <tr><td>Tendered</td><td className="num">{money(invoice.amount_tendered)}</td></tr>
                <tr><td>Change</td><td className="num">{money(invoice.change_given)}</td></tr>
              </>
            )}
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
