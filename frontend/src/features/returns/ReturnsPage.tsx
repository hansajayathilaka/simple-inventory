import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  invoiceItemsService,
  invoicesService,
  posService,
} from "../../services";
import type { Invoice, ReturnResult } from "../../types";
import { errorMessage } from "../../lib/errors";
import { money } from "../../lib/format";

export default function ReturnsPage() {
  const qc = useQueryClient();
  const [number, setNumber] = useState("");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<ReturnResult | null>(null);

  const { data: items } = useQuery({
    queryKey: ["invoice_items", invoice?.id],
    queryFn: () =>
      invoiceItemsService.all({
        filter: `invoice = "${invoice!.id}"`,
        expand: "product",
        sort: "created",
      }),
    enabled: !!invoice,
  });

  const find = useMutation({
    mutationFn: async () => {
      const list = await invoicesService.all({
        filter: `number = "${number.trim()}"`,
      });
      if (list.length === 0) throw new Error("Invoice not found.");
      return list[0];
    },
    onSuccess: (inv) => {
      setInvoice(inv);
      setQtys({});
      setError("");
      setDone(null);
    },
    onError: (e) => {
      setInvoice(null);
      setError(errorMessage(e));
    },
  });

  const submit = useMutation({
    mutationFn: () => {
      const lines = Object.entries(qtys)
        .filter(([, v]) => Number(v) > 0)
        .map(([invoice_item, v]) => ({ invoice_item, qty: Number(v) }));
      if (!invoice) throw new Error("No invoice.");
      if (lines.length === 0) throw new Error("Enter at least one return quantity.");
      return posService.returnGoods({ invoice: invoice.id, reason, items: lines });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setDone(res);
      setInvoice(null);
      setNumber("");
      setReason("");
      setQtys({});
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Returns</h1>
          <div className="muted">Refund and restock items from a past invoice.</div>
        </div>
      </div>

      {done && (
        <div className="alert alert-ok">
          Return <strong>{done.number}</strong> processed — refund {money(done.refund_total)}.
        </div>
      )}

      <div className="card">
        <div className="inline">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Invoice number</label>
            <input
              value={number}
              placeholder="INV-000001"
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && find.mutate()}
            />
          </div>
          <button className="btn btn-primary" onClick={() => find.mutate()} disabled={find.isPending}>
            {find.isPending ? "Searching…" : "Find"}
          </button>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {invoice && (
        <div className="card">
          <h2>
            {invoice.number}{" "}
            <span className="badge">{invoice.status.replace("_", " ")}</span>
          </h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Sold qty</th>
                <th className="num">Unit price</th>
                <th style={{ width: 120 }}>Return qty</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it) => (
                <tr key={it.id}>
                  <td>{(it.expand?.product as { name?: string })?.name ?? "—"}</td>
                  <td className="num">{it.qty}</td>
                  <td className="num">{money(it.unit_price)}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={it.qty}
                      value={qtys[it.id] ?? ""}
                      onChange={(e) => setQtys({ ...qtys, [it.id]: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Reason</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="inline" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? "Processing…" : "Process return"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
