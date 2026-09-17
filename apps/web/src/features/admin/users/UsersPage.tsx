import { useState, type FormEvent } from "react";
import { useAuth } from "../../../shared/auth/useAuth.ts";
import { useAsync } from "../../../shared/hooks/useAsync.ts";
import { describeError } from "../../../shared/api/errors.ts";
import { usersApi } from "./api.ts";
import { ROLES, ROLE_LABELS, roleLabel, type Role } from "../../../shared/lib/roles.ts";
import { PageHeader } from "../../../shared/ui/PageHeader.tsx";
import { Card, CardHeader } from "../../../shared/ui/Card.tsx";
import { Alert } from "../../../shared/ui/Alert.tsx";
import { Button } from "../../../shared/ui/Button.tsx";
import { Field, Input, Select } from "../../../shared/ui/Field.tsx";
import { SkeletonRows } from "../../../shared/ui/Skeleton.tsx";
import { Table, TBody, TD, TH, THead, TR } from "../../../shared/ui/Table.tsx";
import { Badge } from "../../../shared/ui/Badge.tsx";
import { formatDateTime } from "../../../shared/lib/format.ts";
import { PlusIcon } from "../../../shared/icons/index.tsx";

export function UsersPage() {
  const { profile } = useAuth();
  const state = useAsync(() => usersApi.list(), []);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    setCreating(true);
    setError(null);
    try {
      const result = await usersApi.create({ email, fullName: String(form.get("fullName") ?? ""), role: form.get("role") as Role });
      if (result.temporaryPassword) setTempPassword({ email, password: result.temporaryPassword });
      setShowForm(false);
      await state.reload();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRole(id: string, role: Role) {
    setError(null);
    state.setData((prev) => (prev ? prev.map((u) => (u.id === id ? { ...u, role, roleLabel: ROLE_LABELS[role] } : u)) : prev));
    try {
      await usersApi.setRole(id, role);
    } catch (err) {
      setError(describeError(err));
      await state.reload();
    }
  }

  async function handleRemove(id: string, email: string) {
    if (!window.confirm(`Remove ${email}? They will lose access immediately. This cannot be undone.`)) return;
    setError(null);
    try {
      await usersApi.remove(id);
      await state.reload();
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <>
      <PageHeader
        title="User Management"
        description="Accounts are provisioned here by an administrator. There is no public sign-up. A role change takes effect on the user's next request."
        actions={
          <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Add user"}
          </Button>
        }
      />

      {tempPassword ? (
        <Alert
          tone="success"
          title={`Account created for ${tempPassword.email}`}
          actions={
            <Button size="sm" variant="ghost" onClick={() => setTempPassword(null)}>
              Dismiss
            </Button>
          }
        >
          Temporary password, share it securely: <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs">{tempPassword.password}</code>
        </Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {showForm ? (
        <Card className="p-5">
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label="Full name" htmlFor="fullName">
              <Input id="fullName" name="fullName" required placeholder="Full name" />
            </Field>
            <Field label="Work email" htmlFor="email">
              <Input id="email" name="email" type="email" required placeholder="name@company.com" />
            </Field>
            <Field label="Role" htmlFor="role">
              <Select id="role" name="role" defaultValue="project_owner">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="primary" loading={creating} className="w-full">
                Create account
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Accounts" description={state.data ? `${state.data.length} provisioned` : undefined} />
        {state.loading && !state.data ? (
          <SkeletonRows rows={5} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>User</TH>
                <TH>Role</TH>
                <TH>Last sign-in</TH>
                <TH>Created</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {(state.data ?? []).map((u) => {
                const self = u.id === profile?.id;
                return (
                  <TR key={u.id}>
                    <TD>
                      <span className="block text-sm font-medium text-ink-900">{u.fullName ?? "Unnamed"}</span>
                      <span className="block text-xs text-ink-500">{u.email}</span>
                    </TD>
                    <TD>
                      {self ? (
                        <Badge tone="outline">{roleLabel(u.role)} (you)</Badge>
                      ) : (
                        <Select value={u.role ?? ""} onChange={(e) => void handleRole(u.id, e.target.value as Role)} className="h-8 w-44 text-xs">
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </Select>
                      )}
                    </TD>
                    <TD className="text-xs text-ink-600">{u.lastSignInAt ? formatDateTime(u.lastSignInAt) : "Never"}</TD>
                    <TD className="text-xs text-ink-600">{formatDateTime(u.createdAt)}</TD>
                    <TD className="text-right">
                      {!self ? (
                        <Button size="sm" variant="danger" onClick={() => void handleRemove(u.id, u.email)}>
                          Remove
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
