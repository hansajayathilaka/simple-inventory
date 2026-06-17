import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "../../components/Modal";
import DynamicAttributeField from "./DynamicAttributeField";
import {
  attributesService,
  categoriesService,
  productsService,
  uomService,
} from "../../services";
import type { Product } from "../../types";
import { errorMessage } from "../../lib/errors";
import { money } from "../../lib/format";

interface FormState {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category: string;
  base_uom: string;
  cost_price: string;
  sell_price: string;
  tax_rate: string;
  is_active: boolean;
  attributes: Record<string, unknown>;
}

const emptyForm: FormState = {
  sku: "",
  barcode: "",
  name: "",
  description: "",
  category: "",
  base_uom: "",
  cost_price: "",
  sell_price: "",
  tax_rate: "",
  is_active: true,
  attributes: {},
};

export default function ProductsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsService.all({ sort: "name", expand: "category,base_uom" }),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesService.all({ sort: "name" }),
  });
  const { data: uoms } = useQuery({
    queryKey: ["uom"],
    queryFn: () => uomService.all({ sort: "name" }),
  });
  const { data: attrDefs } = useQuery({
    queryKey: ["attribute_definitions"],
    queryFn: () => attributesService.all({ sort: "sort_order,label" }),
  });

  const save = useMutation({
    mutationFn: () => {
      const base = {
        sku: form.sku.trim(),
        barcode: form.barcode.trim(),
        name: form.name.trim(),
        description: form.description,
        category: form.category,
        base_uom: form.base_uom,
        cost_price: form.cost_price === "" ? 0 : Number(form.cost_price),
        sell_price: form.sell_price === "" ? 0 : Number(form.sell_price),
        tax_rate: form.tax_rate === "" ? 0 : Number(form.tax_rate),
        is_active: form.is_active,
        attributes: form.attributes,
      };
      if (image) {
        const fd = new FormData();
        Object.entries(base).forEach(([k, v]) =>
          fd.append(k, k === "attributes" ? JSON.stringify(v) : String(v ?? ""))
        );
        fd.append("image", image);
        return editing
          ? productsService.update(editing.id, fd)
          : productsService.create(fd);
      }
      return editing
        ? productsService.update(editing.id, base as Partial<Product>)
        : productsService.create(base as Partial<Product>);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => productsService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
    onError: (e) => alert(errorMessage(e)),
  });

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setImage(null);
    setError("");
    setOpen(true);
  };
  const startEdit = (p: Product) => {
    setEditing(p);
    setForm({
      sku: p.sku,
      barcode: p.barcode ?? "",
      name: p.name,
      description: p.description ?? "",
      category: p.category ?? "",
      base_uom: p.base_uom ?? "",
      cost_price: String(p.cost_price ?? ""),
      sell_price: String(p.sell_price ?? ""),
      tax_rate: String(p.tax_rate ?? ""),
      is_active: p.is_active ?? true,
      attributes: (p.attributes as Record<string, unknown>) ?? {},
    });
    setImage(null);
    setError("");
    setOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products ?? [];
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q)
    );
  }, [products, search]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <div className="muted">Catalog with custom attributes.</div>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>
          + New product
        </button>
      </div>

      <div className="field" style={{ maxWidth: 320 }}>
        <input
          placeholder="Search by name, SKU or barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">No products.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>UOM</th>
                <th className="num">Cost</th>
                <th className="num">Price</th>
                <th className="num">Tax %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><code>{p.sku}</code></td>
                  <td>{p.name}</td>
                  <td>{(p.expand?.category as { name?: string })?.name ?? "—"}</td>
                  <td>{(p.expand?.base_uom as { abbreviation?: string })?.abbreviation ?? "—"}</td>
                  <td className="num">{money(p.cost_price)}</td>
                  <td className="num">{money(p.sell_price)}</td>
                  <td className="num">{p.tax_rate ?? 0}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-sm" onClick={() => startEdit(p)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm(`Delete "${p.name}"?`)) del.mutate(p.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        title={editing ? "Edit product" : "New product"}
        open={open}
        onClose={() => setOpen(false)}
        width={680}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            save.mutate();
          }}
        >
          {error && <div className="alert alert-error">{error}</div>}
          <div className="grid grid-2">
            <div className="field">
              <label>SKU *</label>
              <input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Barcode</label>
              <input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">—</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Base unit</label>
              <select
                value={form.base_uom}
                onChange={(e) => setForm({ ...form, base_uom: e.target.value })}
              >
                <option value="">—</option>
                {(uoms ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.abbreviation})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-3">
            <div className="field">
              <label>Cost price</label>
              <input
                type="number"
                step="any"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Sell price *</label>
              <input
                type="number"
                step="any"
                value={form.sell_price}
                onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Tax %</label>
              <input
                type="number"
                step="any"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
          </div>

          {(attrDefs ?? []).length > 0 && (
            <>
              <h3 style={{ margin: "8px 0 10px" }}>Custom attributes</h3>
              {(attrDefs ?? []).map((def) => (
                <DynamicAttributeField
                  key={def.id}
                  def={def}
                  value={form.attributes[def.key]}
                  onChange={(v) =>
                    setForm({
                      ...form,
                      attributes: { ...form.attributes, [def.key]: v },
                    })
                  }
                />
              ))}
            </>
          )}

          <div className="checkbox" style={{ margin: "8px 0" }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <label style={{ margin: 0 }}>Active</label>
          </div>

          <div className="inline" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
