import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Modal from "../../components/Modal";
import { attributesService, lookupServices } from "../../services";
import type { AttributeDefinition, AttributeType } from "../../types";
import { errorMessage } from "../../lib/errors";

const TYPES: AttributeType[] = [
  "text",
  "number",
  "boolean",
  "date",
  "select",
  "relation",
];
const LOOKUP_TARGETS = Object.keys(lookupServices);

interface FormState {
  key: string;
  label: string;
  type: AttributeType;
  target_collection: string;
  optionsText: string;
  is_required: boolean;
  is_multiple: boolean;
  sort_order: string;
}

const empty: FormState = {
  key: "",
  label: "",
  type: "text",
  target_collection: "",
  optionsText: "",
  is_required: false,
  is_multiple: false,
  sort_order: "0",
};

export default function AttributesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AttributeDefinition | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["attribute_definitions"],
    queryFn: () => attributesService.all({ sort: "sort_order,label" }),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<AttributeDefinition> = {
        key: form.key.trim(),
        label: form.label.trim(),
        type: form.type,
        is_required: form.is_required,
        is_multiple: form.is_multiple,
        applies_to: "product",
        sort_order: Number(form.sort_order) || 0,
        target_collection: form.type === "relation" ? form.target_collection : "",
        options:
          form.type === "select"
            ? {
                values: form.optionsText
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : null,
      };
      return editing
        ? attributesService.update(editing.id, payload)
        : attributesService.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attribute_definitions"] });
      setOpen(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => attributesService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attribute_definitions"] }),
    onError: (e) => alert(errorMessage(e)),
  });

  const startCreate = () => {
    setEditing(null);
    setForm(empty);
    setError("");
    setOpen(true);
  };
  const startEdit = (a: AttributeDefinition) => {
    setEditing(a);
    setForm({
      key: a.key,
      label: a.label,
      type: a.type,
      target_collection: a.target_collection ?? "",
      optionsText: (a.options?.values ?? []).join(", "),
      is_required: !!a.is_required,
      is_multiple: !!a.is_multiple,
      sort_order: String(a.sort_order ?? 0),
    });
    setError("");
    setOpen(true);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Product Attributes</h1>
          <div className="muted">
            Define custom fields for products — e.g. a “Make” that references
            Brands, a numeric “Weight”, or a select list.
          </div>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>
          + New attribute
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : (data ?? []).length === 0 ? (
          <div className="empty">No attributes defined yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Key</th>
                <th>Type</th>
                <th>Target / Options</th>
                <th>Required</th>
                <th>Multiple</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{a.label}</td>
                  <td><code>{a.key}</code></td>
                  <td><span className="badge">{a.type}</span></td>
                  <td>
                    {a.type === "relation"
                      ? a.target_collection
                      : a.type === "select"
                      ? (a.options?.values ?? []).join(", ")
                      : "—"}
                  </td>
                  <td>{a.is_required ? "Yes" : "No"}</td>
                  <td>{a.is_multiple ? "Yes" : "No"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-sm" onClick={() => startEdit(a)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm(`Delete attribute "${a.label}"?`)) del.mutate(a.id);
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
        title={editing ? "Edit attribute" : "New attribute"}
        open={open}
        onClose={() => setOpen(false)}
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
              <label>Label</label>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Key (machine name)</label>
              <input
                value={form.key}
                placeholder="e.g. make"
                onChange={(e) =>
                  setForm({
                    ...form,
                    key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase(),
                  })
                }
                required
              />
            </div>
          </div>
          <div className="field">
            <label>Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AttributeType })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {form.type === "relation" && (
            <div className="field">
              <label>References collection</label>
              <select
                value={form.target_collection}
                onChange={(e) => setForm({ ...form, target_collection: e.target.value })}
                required
              >
                <option value="">— choose —</option>
                {LOOKUP_TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}
          {form.type === "select" && (
            <div className="field">
              <label>Options (comma separated)</label>
              <input
                value={form.optionsText}
                placeholder="Small, Medium, Large"
                onChange={(e) => setForm({ ...form, optionsText: e.target.value })}
              />
            </div>
          )}
          <div className="inline">
            <div className="checkbox">
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
              />
              <label style={{ margin: 0 }}>Required</label>
            </div>
            <div className="checkbox">
              <input
                type="checkbox"
                checked={form.is_multiple}
                onChange={(e) => setForm({ ...form, is_multiple: e.target.checked })}
              />
              <label style={{ margin: 0 }}>Allow multiple</label>
            </div>
            <div className="field" style={{ width: 120, marginBottom: 0 }}>
              <label>Sort order</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>
          </div>
          <div className="inline" style={{ justifyContent: "flex-end", marginTop: 12 }}>
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
