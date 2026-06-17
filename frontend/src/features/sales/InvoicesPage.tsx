import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { invoicesService } from "../../services";
import { money, dateTime } from "../../lib/format";
import type { InvoiceStatus } from "../../types";

const statusBadge: Record<InvoiceStatus, string> = {
  draft: "badge",
  paid: "badge ok",
  void: "badge danger",
  partially_returned: "badge warn",
  returned: "badge danger",
};

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => invoicesService.all({ sort: "-created", expand: "customer,cashier" }),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (data ?? []).filter((i) => i.status !== "draft");
    if (!q) return list;
    return list.filter((i) => i.number.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Invoices</h1>
          <div className="muted">All completed sales.</div>
        </div>
      </div>

      <div className="field" style={{ maxWidth: 280 }}>
        <input
          placeholder="Search by invoice number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">No invoices yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Cashier</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td><code>{i.number}</code></td>
                  <td>{dateTime(i.created)}</td>
                  <td>{(i.expand?.customer as { name?: string })?.name ?? "Walk-in"}</td>
                  <td>{(i.expand?.cashier as { name?: string })?.name ?? "—"}</td>
                  <td className="num">{money(i.grand_total)}</td>
                  <td><span className={statusBadge[i.status]}>{i.status.replace("_", " ")}</span></td>
                  <td>
                    <Link className="btn btn-sm" to={`/invoices/${i.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
