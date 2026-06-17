import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  inventoryService,
  invoicesService,
  productsService,
} from "../../services";
import { money, dateTime } from "../../lib/format";

export default function Dashboard() {
  const { user, isOwner } = useAuth();

  const { data: invoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => invoicesService.all({ sort: "-created", expand: "cashier" }),
  });
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsService.all({}),
    enabled: isOwner,
  });
  const { data: inventory } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => inventoryService.all({}),
    enabled: isOwner,
  });

  const stats = useMemo(() => {
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const todays = (invoices ?? []).filter(
      (i) => i.status !== "draft" && new Date(i.created) >= startToday
    );
    const todaysTotal = todays.reduce((s, i) => s + (i.grand_total || 0), 0);
    const invMap = new Map(inventory?.map((i) => [i.product, i]) ?? []);
    const lowCount = (products ?? []).filter((p) => {
      const inv = invMap.get(p.id);
      return inv && inv.reorder_level > 0 && inv.qty_on_hand <= inv.reorder_level;
    }).length;
    return {
      todaysTotal,
      todaysCount: todays.length,
      productCount: products?.length ?? 0,
      lowCount,
    };
  }, [invoices, products, inventory]);

  const recent = (invoices ?? []).filter((i) => i.status !== "draft").slice(0, 8);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Welcome, {user?.name}</h1>
          <div className="muted">Here’s what’s happening in your shop.</div>
        </div>
        <Link className="btn btn-primary" to="/pos">
          Open Point of Sale
        </Link>
      </div>

      <div className="grid grid-4">
        <div className="stat">
          <div className="lbl">Today’s sales</div>
          <div className="val">{money(stats.todaysTotal)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Today’s invoices</div>
          <div className="val">{stats.todaysCount}</div>
        </div>
        {isOwner && (
          <>
            <div className="stat">
              <div className="lbl">Products</div>
              <div className="val">{stats.productCount}</div>
            </div>
            <div className="stat">
              <div className="lbl">Low stock</div>
              <div className="val">{stats.lowCount}</div>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0 }}>
        <div style={{ padding: "14px 18px 0" }}>
          <h2>Recent sales</h2>
        </div>
        {recent.length === 0 ? (
          <div className="empty">No sales yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Cashier</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((i) => (
                <tr key={i.id}>
                  <td><code>{i.number}</code></td>
                  <td>{dateTime(i.created)}</td>
                  <td>{(i.expand?.cashier as { name?: string })?.name ?? "—"}</td>
                  <td className="num">{money(i.grand_total)}</td>
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
