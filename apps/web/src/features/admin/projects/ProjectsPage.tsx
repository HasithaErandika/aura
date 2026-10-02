import { useState, type FormEvent } from "react";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { describeError } from "@/shared/api/errors.ts";
import { projectsApi } from "./api.ts";
import type { Project, RepositoryProvider } from "../types.ts";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { Card } from "@/shared/ui/Card.tsx";
import { CardHeader } from "@/shared/ui/CardHeader.tsx";
import { Alert } from "@/shared/ui/Alert.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { Field } from "@/shared/ui/Field.tsx";
import { Input } from "@/shared/ui/Input.tsx";
import { Select } from "@/shared/ui/Select.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/Table.tsx";
import { Badge } from "@/shared/ui/Badge.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { Modal } from "@/shared/ui/Modal.tsx";
import { formatDateTime } from "@/shared/lib/format.ts";
import { GitIcon, PlusIcon } from "@/shared/icons/index.tsx";

export function ProjectsPage() {
  const state = useAsync(() => projectsApi.list(), []);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoFor, setRepoFor] = useState<Project | null>(null);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setCreating(true);
    setError(null);
    try {
      await projectsApi.create({
        key: String(form.get("key") ?? ""),
        name: String(form.get("name") ?? ""),
        jiraProjectKey: String(form.get("jiraProjectKey") ?? ""),
      });
      setShowForm(false);
      await state.reload();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRemoveProject(project: Project) {
    if (!window.confirm(`Delete project ${project.key}? Its repository registration is removed too. The repository itself is not touched.`)) return;
    setError(null);
    try {
      await projectsApi.remove(project.id);
      await state.reload();
    } catch (err) {
      setError(describeError(err));
    }
  }

  async function handleRemoveRepository(project: Project) {
    if (!project.repository || !window.confirm(`Unlink ${project.repository.fullName} from ${project.key}? The repository itself is not touched.`)) return;
    setError(null);
    try {
      await projectsApi.removeRepository(project.id);
      await state.reload();
    } catch (err) {
      setError(describeError(err));
    }
  }

  const projects = state.data ?? [];

  return (
    <>
      <PageHeader
        title="Projects & Repositories"
        description="A Project ties a Jira project to the Git repository its code lives in. Task branches and pull requests are created in that repository."
        actions={
          <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Add project"}
          </Button>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {showForm ? (
        <Card className="p-5">
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label="Project key" htmlFor="key" hint="e.g. SHOP">
              <Input id="key" name="key" required pattern="[A-Za-z][A-Za-z0-9_]{1,31}" className="uppercase" />
            </Field>
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required maxLength={120} placeholder="Online shop" />
            </Field>
            <Field label="Jira project key" htmlFor="jiraProjectKey" hint="e.g. KAN">
              <Input id="jiraProjectKey" name="jiraProjectKey" required pattern="[A-Za-z][A-Za-z0-9_]{1,31}" className="uppercase" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="primary" loading={creating} className="w-full">
                Create project
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Projects" description={state.data ? `${projects.length} registered` : undefined} />
        {state.loading && !state.data ? (
          <SkeletonRows rows={3} />
        ) : projects.length === 0 ? (
          <EmptyState icon={<GitIcon className="size-5" />} title="No projects yet" description="Add a project, then register the repository its code lives in." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Project</TH>
                <TH>Jira</TH>
                <TH>Repository</TH>
                <TH>Created</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {projects.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <span className="block text-sm font-medium text-ink-900">{p.name}</span>
                    <span className="block font-mono text-xs text-ink-500">{p.key}</span>
                  </TD>
                  <TD>
                    <Badge tone="outline">{p.jiraProjectKey}</Badge>
                  </TD>
                  <TD>
                    {p.repository ? (
                      <div className="flex items-center gap-2">
                        <Badge tone={p.repository.provider === "github" ? "brand" : "neutral"}>{p.repository.provider}</Badge>
                        <span className="font-mono text-xs text-ink-900">{p.repository.fullName}</span>
                        <span className="text-xs text-ink-500">({p.repository.defaultBranch})</span>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setRepoFor(p)}>
                        Register repository
                      </Button>
                    )}
                  </TD>
                  <TD className="text-xs text-ink-600">{formatDateTime(p.createdAt)}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      {p.repository ? (
                        <Button size="sm" variant="ghost" onClick={() => void handleRemoveRepository(p)}>
                          Unlink repository
                        </Button>
                      ) : null}
                      <Button size="sm" variant="danger" onClick={() => void handleRemoveProject(p)}>
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <RepositoryModal
        project={repoFor}
        onClose={() => setRepoFor(null)}
        onSaved={async () => {
          setRepoFor(null);
          await state.reload();
        }}
      />
    </>
  );
}

function RepositoryModal({ project, onClose, onSaved }: { project: Project | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [provider, setProvider] = useState<RepositoryProvider>("github");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!project) return;
    const form = new FormData(e.currentTarget);
    const installation = String(form.get("installationId") ?? "").trim();
    setSaving(true);
    setError(null);
    try {
      await projectsApi.setRepository(project.id, {
        provider,
        owner: String(form.get("owner") ?? "").trim(),
        name: String(form.get("name") ?? "").trim(),
        defaultBranch: String(form.get("defaultBranch") ?? "").trim() || "main",
        installationId: provider === "github" && installation ? Number(installation) : undefined,
      });
      await onSaved();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={project !== null}
      onClose={onClose}
      title={project ? `Repository for ${project.key}` : "Repository"}
      description="One repository per project. Registering it doesn't change the repository; AURA creates branches and pull requests in it later."
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {error ? (
          <div className="sm:col-span-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}
        <Field label="Provider" htmlFor="provider" hint={provider === "local" ? "A bare repository on the runtime's disk, for local use and tests" : "Reached through the AURA GitHub App"}>
          <Select id="provider" value={provider} onChange={(e) => setProvider(e.target.value as RepositoryProvider)}>
            <option value="github">GitHub</option>
            <option value="local">Local</option>
          </Select>
        </Field>
        <Field label="Default branch" htmlFor="defaultBranch">
          <Input id="defaultBranch" name="defaultBranch" defaultValue="main" />
        </Field>
        <Field label={provider === "github" ? "Owner (org or user)" : "Owner (folder)"} htmlFor="owner">
          <Input id="owner" name="owner" required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,99}" />
        </Field>
        <Field label="Repository name" htmlFor="repoName">
          <Input id="repoName" name="name" required pattern="[A-Za-z0-9_.\-]{1,100}" />
        </Field>
        {provider === "github" ? (
          <Field label="GitHub App installation id" htmlFor="installationId" hint="Optional until the GitHub App is set up">
            <Input id="installationId" name="installationId" type="number" min={1} />
          </Field>
        ) : null}
        <div className="flex items-end justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Register
          </Button>
        </div>
      </form>
    </Modal>
  );
}
