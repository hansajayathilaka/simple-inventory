import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { RecordModel } from "pocketbase";
import Modal from "./Modal";
import { errorMessage } from "../lib/errors";
import type { collection } from "../services/crud";

export type FieldType =
  | "text"
  | "number"
  | "email"
  | "textarea"
  | "checkbox"
  | "select";

export interface CrudField {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface CrudColumn<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface CrudPageProps<T extends RecordModel> {
  title: string;
  subtitle?: string;
  service: ReturnType<typeof collection<T>>;
  queryKey: string;
  columns: CrudColumn<T>[];
  fields: CrudField[];
  sort?: string;
  defaultValues?: Record<string, unknown>;
  canDelete?: boolean;
}

export default function CrudPage<T extends RecordModel>({
  title,
  subtitle,
  service,
  queryKey,
  columns,
  fields,
  sort,
  defaultValues = {},
  canDelete = true,
}: CrudPageProps<T>) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => service.all({ sort }),
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? service.update(editing.id, payload as Partial<T>)
        : service.create(payload as Partial<T>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      setOpen(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => service.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
    onError: (e) => alert(errorMessage(e)),
  });

  const startCreate = () => {
    setEditing(null);
    setForm({ ...defaultValues });
    setError("");
    setOpen(true);
  };
  const startEdit = (row: T) => {
    setEditing(row);
    const f: Record<string, unknown> = {};
    for (const fld of fields) f[fld.name] = (row as Record<string, unknown>)[fld.name];
    setForm(f);
    setError("");
    setOpen(true);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const payload: Record<string, unknown> = {};
    for (const fld of fields) {
      let v = form[fld.name];
      if (fld.type === "number") v = v === "" || v == null ? null : Number(v);
      if (fld.type === "checkbox") v = !!v;
      payload[fld.name] = v;
    }
    save.mutate(payload);
  };

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <div className="muted">{subtitle}</div>}
        </div>
        <button className="btn btn-primary" onClick={startCreate}>
          + New
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Nothing here yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={String(c.key)} className={c.className}>
                    {c.label}
                  </th>
                ))}
                <th style={{ width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={String(c.key)} className={c.className}>
                      {c.render
                        ? c.render(row)
                        : String((row as Record<string, unknown>)[c.key as string] ?? "")}
                    </td>
                  ))}
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-sm" onClick={() => startEdit(row)}>
                        Edit
                      </button>
                      {canDelete && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            if (confirm(`Delete "${(row as any).name ?? row.id}"?`))
                              del.mutate(row.id);
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        title={`${editing ? "Edit" : "New"} ${title.replace(/s$/, "")}`}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={onSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          {fields.map((f) => (
            <div className="field" key={f.name}>
              {f.type !== "checkbox" && <label>{f.label}</label>}
              {f.type === "textarea" ? (
                <textarea
                  rows={3}
                  value={(form[f.name] as string) ?? ""}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                />
              ) : f.type === "select" ? (
                <select
                  value={(form[f.name] as string) ?? ""}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  required={f.required}
                >
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "checkbox" ? (
                <div className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!form[f.name]}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })}
                  />
                  <label style={{ margin: 0 }}>{f.label}</label>
                </div>
              ) : (
                <input
                  type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                  step="any"
                  placeholder={f.placeholder}
                  value={(form[f.name] as string | number) ?? ""}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  required={f.required}
                />
              )}
            </div>
          ))}
          <div className="inline" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
