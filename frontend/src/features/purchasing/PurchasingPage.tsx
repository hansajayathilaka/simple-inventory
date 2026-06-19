import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import {
  productsService,
  purchaseOrderItemsService,
  purchaseOrdersService,
  stockService,
  suppliersService,
} from "../../services";
import type { PurchaseOrder } from "../../types";
import { errorMessage } from "../../lib/errors";
import { money, date } from "../../lib/format";
import { useAuth } from "../../auth/AuthContext";

interface Line {
  product: string;
  qty: string;
  unit_cost: string;
}

export default function PurchasingPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product: "", qty: "", unit_cost: "" }]);
  const [error, setError] = useState("");

  const {
    items: orders,
    page,
    setPage,
    totalPages,
    totalItems,
    isFetching,
  } = usePaginatedList<PurchaseOrder>(purchaseOrdersService, ["purchase_orders"], {
    sort: "-created",
    expand: "supplier",
  });
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersService.all({ sort: "name" }),
  });
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsService.all({ sort: "name" }),
  });

  const create = useMutation({
    mutationFn: async () => {
      const valid = lines.filter((l) => l.product && Number(l.qty) > 0);
      if (!supplier) throw new Error("Choose a supplier.");
      if (valid.length === 0) throw new Error("Add at least one line.");
      const po = await purchaseOrdersService.create({
        supplier,
        reference,
        status: "draft",
        created_by: user?.id,
      } as Partial<PurchaseOrder>);
      for (const l of valid) {
        const qty = Number(l.qty);
        const cost = Number(l.unit_cost) || 0;
        await purchaseOrderItemsService.create({
          purchase_order: po.id,
          product: l.product,
          qty,
          unit_cost: cost,
          line_total: Math.round(qty * cost * 100) / 100,
        });
      }
      return po;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_orders"] });
      setOpen(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const receive = useMutation({
    mutationFn: (id: string) => stockService.receivePurchaseOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_orders"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e) => alert(errorMessage(e)),
  });

  const startCreate = () => {
    setSupplier("");
    setReference("");
    setLines([{ product: "", qty: "", unit_cost: "" }]);
    setError("");
    setOpen(true);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Purchasing</h1>
          <div className="muted">Create purchase orders and receive stock.</div>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>
          + New purchase order
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Supplier</th>
              <th>Reference</th>
              <th>Status</th>
              <th className="num">Total cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((po) => (
              <tr key={po.id}>
                <td>{date(po.created)}</td>
                <td>{(po.expand?.supplier as { name?: string })?.name ?? "—"}</td>
                <td>{po.reference || "—"}</td>
                <td>
                  <span
                    className={
                      po.status === "received"
                        ? "badge ok"
                        : po.status === "cancelled"
                        ? "badge danger"
                        : "badge warn"
                    }
                  >
                    {po.status}
                  </span>
                </td>
                <td className="num">{money(po.total_cost)}</td>
                <td>
                  {po.status === "draft" && (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={receive.isPending}
                      onClick={() => {
                        if (confirm("Receive this PO into stock?")) receive.mutate(po.id);
                      }}
                    >
                      Receive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        onChange={setPage}
        isFetching={isFetching}
      />

      <Modal title="New purchase order" open={open} onClose={() => setOpen(false)} width={680}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            create.mutate();
          }}
        >
          {error && <div className="alert alert-error">{error}</div>}
          <div className="grid grid-2">
            <div className="field">
              <label>Supplier *</label>
              <select value={supplier} onChange={(e) => setSupplier(e.target.value)} required>
                <option value="">—</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Reference</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>

          <h3 style={{ margin: "6px 0 8px" }}>Items</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ width: 90 }}>Qty</th>
                <th style={{ width: 110 }}>Unit cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <select
                      value={l.product}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i].product = e.target.value;
                        setLines(next);
                      }}
                    >
                      <option value="">—</option>
                      {(products ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={l.qty}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i].qty = e.target.value;
                        setLines(next);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={l.unit_cost}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i].unit_cost = e.target.value;
                        setLines(next);
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => setLines([...lines, { product: "", qty: "", unit_cost: "" }])}
          >
            + Add line
          </button>

          <div className="inline" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Create draft"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
