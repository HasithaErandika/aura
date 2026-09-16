import { useEffect, useState, type FormEvent } from "react";
import { AppLayout } from "../components/AppLayout.tsx";
import { api } from "../lib/api.ts";
import { ROLES, ROLE_LABELS, type Role } from "../lib/roles.ts";

interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role | null;
  roleLabel: string | null;
  lastSignInAt: string | null;
  createdAt: string;
}

const roleBadge: Record<Role, string> = {
  admin: "bg-brand-red/10 text-brand-red",
  project_owner: "bg-prism-gold/20 text-[#96700d]",
  business_analyst: "bg-prism-orange/15 text-[#a15a0f]",
  architect: "bg-prism-purple/10 text-prism-purple",
  developer: "bg-slate-100 text-slate-600",
  qa_engineer: "bg-sec-green/15 text-[#5c7015]",
  tester: "bg-prism-magenta/10 text-prism-magenta",
  deployer: "bg-prism-red-orange/10 text-prism-red-orange",
};

export function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await api.get<{ users: AdminUser[] }>("/users");
      setUsers(data.users);
      setError(null);
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function handleRoleChange(id: string, role: Role) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role, roleLabel: ROLE_LABELS[role] } : u)));
    try {
      await api.patch(`/users/${id}/role`, { role });
    } catch {
      setError("Could not update role.");
      void loadUsers();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Deprovision this account? This cannot be undone.")) return;
    try {
      await api.delete(`/users/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      setError("Could not delete user.");
    }
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setCreating(true);
    setError(null);
    try {
      const result = await api.post<{ temporaryPassword?: string }>("/users", {
        email: form.get("email"),
        fullName: form.get("fullName"),
        role: form.get("role"),
      });
      setLastTempPassword(result.temporaryPassword ?? null);
      setShowForm(false);
      await loadUsers();
    } catch {
      setError("Could not create user. Check the email isn't already in use.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppLayout title="User Management" subtitle="Registry &middot; roles & grants">
      {lastTempPassword ? (
        <div className="rounded-2xl border border-prism-gold/40 bg-prism-gold/10 p-4 text-sm text-[#7a5a0d]">
          Account created. Temporary password (share this with the user securely):{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">{lastTempPassword}</code>
          <button type="button" className="ml-3 font-semibold underline" onClick={() => setLastTempPassword(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? <div className="rounded-2xl bg-brand-red/10 p-4 text-sm font-medium text-brand-red">{error}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Accounts</h2>
            <p className="text-xs text-sec-grey">{users.length} provisioned users</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-brand-red px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-red-dark"
          >
            {showForm ? "Cancel" : "+ Add user"}
          </button>
        </div>

        {showForm ? (
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-4">
            <input
              name="fullName"
              required
              placeholder="Full name"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="Work email"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
            />
            <select
              name="role"
              required
              defaultValue="developer"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-brand-red px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-red-dark disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create account"}
            </button>
          </form>
        ) : null}

        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-sec-grey">Loading users…</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-sec-grey">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Last sign-in</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-800">{u.fullName ?? "—"}</p>
                    <p className="text-xs text-sec-grey">{u.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <select
                      value={u.role ?? ""}
                      onChange={(e) => void handleRoleChange(u.id, e.target.value as Role)}
                      className={`rounded px-2 py-1 text-xs font-semibold ${u.role ? roleBadge[u.role] : "bg-slate-100 text-slate-500"}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-sec-grey">
                    {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => void handleDelete(u.id)}
                      className="text-xs font-semibold text-brand-red hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
