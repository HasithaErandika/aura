import { useState } from "react";
import { describeError } from "@/shared/api/errors.ts";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { Alert } from "@/shared/ui/Alert.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { Modal } from "@/shared/ui/Modal.tsx";
import { Select } from "@/shared/ui/Select.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";
import { usersApi } from "../users/api.ts";
import type { Project } from "../types.ts";
import { projectsApi } from "./api.ts";

// Members of a project see and work on it; everyone else is refused (admins always have access).
export function MembersModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const projectId = project?.id ?? null;
  const members = useAsync(() => (projectId ? projectsApi.members(projectId) : Promise.resolve([])), [projectId]);
  const users = useAsync(() => (projectId ? usersApi.list() : Promise.resolve([])), [projectId]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberIds = new Set((members.data ?? []).map((m) => m.userId));
  const candidates = (users.data ?? []).filter((u) => u.role && u.role !== "admin" && !memberIds.has(u.id));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await members.reload();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={project !== null} onClose={onClose} title={project ? `Members of ${project.key}` : "Members"} description="Only members (and admins) see this project's runs, approvals, design documents and pull requests.">
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {members.error ?? users.error ? <Alert tone="danger">{members.error ?? users.error}</Alert> : null}
        <div className="flex gap-2">
          <Select aria-label="Person to add" value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1">
            <option value="">{candidates.length ? "Choose a person to add" : "Everyone is already a member"}</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName ?? u.email} ({u.roleLabel ?? u.role})
              </option>
            ))}
          </Select>
          <Button variant="primary" disabled={!pick} loading={busy} onClick={() => void run(async () => { await projectsApi.addMember(project!.id, pick); setPick(""); })}>
            Add
          </Button>
        </div>
        {members.loading && !members.data ? (
          <SkeletonRows rows={3} />
        ) : (members.data ?? []).length === 0 ? (
          <EmptyState title="No members yet" description="Nobody but admins can use this project until you add people." />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {(members.data ?? []).map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-900">{m.fullName ?? m.email ?? m.userId}</span>
                  {m.fullName && m.email ? <span className="block truncate text-xs text-ink-500">{m.email}</span> : null}
                </span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => projectsApi.removeMember(project!.id, m.userId))}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
