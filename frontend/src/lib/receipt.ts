import type { AppSettings } from "../types";

export interface ReceiptLine {
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface ReceiptData {
  number: string;
  date: string;
  cashier?: string;
  customer?: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment?: string;
  tendered?: number;
  change?: number;
}

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"
  );
}

function m(n: number, cur: string): string {
  return cur + (Number(n) || 0).toFixed(2);
}

// Build a standalone, thermal-printer-friendly receipt document. Width and
// header/footer come from the customization panel (app_settings.receipt).
export function buildReceiptHTML(
  settings: AppSettings | null,
  data: ReceiptData
): string {
  const cur = settings?.currency_symbol ?? "";
  const r = settings?.receipt;
  const width = r?.paperWidthMm ?? 80;
  const font = r?.fontSizePt ?? 12;
  const company = settings?.company_name ?? "Simple Inventory";

  const rows = data.lines
    .map(
      (l) => `<tr>
        <td>${esc(l.name)}</td>
        <td class="n">${l.qty}</td>
        <td class="n">${m(l.unit_price, cur)}</td>
        <td class="n">${m(l.line_total, cur)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  @page { size: ${width}mm auto; margin: 2mm; }
  body { width: ${width}mm; margin: 0; font-family: "Courier New", monospace; font-size: ${font}px; }
  h1 { font-size: ${font + 2}px; text-align: center; margin: 0 0 2px; }
  .ctr { text-align: center; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.n { text-align: right; white-space: nowrap; padding-left: 4px; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
</style></head><body>
  <h1>${esc(company)}</h1>
  ${settings?.company_address ? `<div class="ctr">${esc(settings.company_address)}</div>` : ""}
  ${settings?.company_phone ? `<div class="ctr">${esc(settings.company_phone)}</div>` : ""}
  ${r?.header ? `<div class="ctr">${esc(r.header)}</div>` : ""}
  <hr />
  <div>Receipt: ${esc(data.number)}</div>
  <div>Date: ${esc(data.date)}</div>
  ${data.cashier ? `<div>Cashier: ${esc(data.cashier)}</div>` : ""}
  ${data.customer ? `<div>Customer: ${esc(data.customer)}</div>` : ""}
  <hr />
  <table>
    <thead><tr><td>Item</td><td class="n">Qty</td><td class="n">Price</td><td class="n">Total</td></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <hr />
  <table>
    <tr><td>Subtotal</td><td class="n">${m(data.subtotal, cur)}</td></tr>
    <tr><td>Discount</td><td class="n">-${m(data.discount, cur)}</td></tr>
    <tr><td>Tax</td><td class="n">${m(data.tax, cur)}</td></tr>
    <tr><td><b>Total</b></td><td class="n"><b>${m(data.total, cur)}</b></td></tr>
  </table>
  <hr />
  ${data.payment ? `<div>Payment: ${esc(data.payment)}</div>` : ""}
  ${
    data.tendered != null
      ? `<table>
          <tr><td>Tendered</td><td class="n">${m(data.tendered, cur)}</td></tr>
          <tr><td>Change</td><td class="n">${m(data.change ?? 0, cur)}</td></tr>
        </table>`
      : ""
  }
  <div class="ctr">${esc(r?.footer ?? "Thank you!")}</div>
</body></html>`;
}
