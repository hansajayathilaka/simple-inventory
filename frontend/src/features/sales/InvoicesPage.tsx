import { useState } from "react";
import { Link } from "react-router-dom";
import Pagination from "../../components/Pagination";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { invoicesService } from "../../services";
import { money, dateTime } from "../../lib/format";
import type { Invoice, InvoiceStatus } from "../../types";

const statusBadge: Record<InvoiceStatus, string> = {
  draft: "badge",
  paid: "badge ok",
  void: "badge danger",
  partially_returned: "badge warn",
  returned: "badge danger",
};

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const q = search.trim().replace(/["\\]/g, "");
  // exclude drafts; add number search
  const filter = q
    ? `status != "draft" && number ~ "${q}"`
    : `status != "draft"`;

  const { items, isLoading, page, setPage, totalPages, totalItems, isFetching } =
    usePaginatedList<Invoice>(invoicesService, ["invoices", "list"], {
      sort: "-created",
      expand: "customer,cashier",
      filter,
    });

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
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : items.length === 0 ? (
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
              {items.map((i) => (
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

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        onChange={setPage}
        isFetching={isFetching}
      />
    </div>
  );
}
