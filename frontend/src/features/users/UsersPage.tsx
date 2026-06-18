import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { usersService } from "../../services";
import type { User } from "../../types";
import { errorMessage } from "../../lib/errors";

export default function UsersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const { items: users, isLoading, page, setPage, totalPages, totalItems, isFetching } =
    usePaginatedList<User>(usersService, ["users"], { sort: "name" });

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const payload: Record<string, unknown> = {
          name: form.name,
          role: form.role,
          active: form.active === "true",
        };
        if (form.password) {
          payload.password = form.password;
          payload.passwordConfirm = form.password;
        }
        return usersService.update(editing.id, payload as Partial<User>);
      }
      return usersService.create({
        email: form.email,
        password: form.password,
        passwordConfirm: form.password,
        name: form.name,
        role: form.role,
        active: true,
        emailVisibility: true,
      } as unknown as Partial<User>);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setOpen(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => usersService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: (e) => alert(errorMessage(e)),
  });

  const startCreate = () => {
    setEditing(null);
    setForm({ role: "cashier" });
    setError("");
    setOpen(true);
  };
  const startEdit = (u: User) => {
    setEditing(u);
    setForm({ name: u.name, role: u.role, active: String(!!u.active), email: u.email });
    setError("");
    setOpen(true);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <div className="muted">Shop staff accounts and roles.</div>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>
          + New user
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className="badge">{u.role}</span>
                  </td>
                  <td>
                    {u.active ? (
                      <span className="badge ok">Active</span>
                    ) : (
                      <span className="badge danger">Disabled</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-sm" onClick={() => startEdit(u)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm(`Delete ${u.name}?`)) del.mutate(u.id);
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

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        onChange={setPage}
        isFetching={isFetching}
      />

      <Modal
        title={editing ? "Edit user" : "New user"}
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
          <div className="field">
            <label>Name</label>
            <input
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          {!editing && (
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
          )}
          <div className="field">
            <label>{editing ? "New password (leave blank to keep)" : "Password"}</label>
            <input
              type="password"
              value={form.password ?? ""}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editing}
              minLength={8}
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select
              value={form.role ?? "cashier"}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="cashier">Cashier</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          {editing && (
            <div className="field">
              <label>Status</label>
              <select
                value={form.active ?? "true"}
                onChange={(e) => setForm({ ...form, active: e.target.value })}
              >
                <option value="true">Active</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          )}
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
