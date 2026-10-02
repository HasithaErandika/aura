import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { ApiError, describeError } from "../../shared/api/errors.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Input, Select, Textarea } from "../../shared/ui/Field.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Markdown } from "../../shared/ui/Markdown.tsx";
import { Spinner } from "../../shared/ui/Spinner.tsx";
import { Tabs } from "../../shared/ui/Tabs.tsx";
import { DocumentIcon, PlusIcon } from "../../shared/icons/index.tsx";
import { timeAgo } from "../../shared/lib/format.ts";
import { cn } from "../../shared/lib/cn.ts";
import { KIND_LABELS, designDocsApi, groupByKind, versionAuthor, type DesignDoc, type DocKind } from "./api.ts";

// One page shape for the Design documents and QA pages: pick an Epic, pick a document, read it
// as Markdown, and (for the kinds your role owns) edit it. Every save is a new version; saving
// over a version someone else saved meanwhile is refused, so nobody's edit is lost.

// Kinds a person can add by hand. The architecture plan, SRS, delivery plan and test plan are one
// per Epic and come from the agents at their gate.
const ADDABLE: DocKind[] = ["adr", "qa-scenario"];

export function DocumentsWorkspace({ title, description, kinds, notice }: { title: string; description: string; kinds: DocKind[]; notice?: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const epicKey = params.get("epic")?.trim().toUpperCase() || null;
  const docId = params.get("doc");
  const kindsKey = kinds.join(",");

  const epicsState = useAsync(() => designDocsApi.epics(kinds), [kindsKey]);
  const epics = epicsState.data?.epics ?? [];
  const editable = epicsState.data?.editableKinds ?? [];

  const select = (next: { epic?: string | null; doc?: string | null }) => {
    const p = new URLSearchParams(params);
    if (next.epic !== undefined) {
      if (next.epic) p.set("epic", next.epic);
      else p.delete("epic");
      p.delete("doc");
    }
    if (next.doc !== undefined) {
      if (next.doc) p.set("doc", next.doc);
      else p.delete("doc");
    }
    setParams(p, { replace: true });
  };

  // Lands on the most recently updated Epic when the link names none.
  useEffect(() => {
    if (!epicKey && epics.length > 0) select({ epic: epics[0]!.epicKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicKey, epics.length]);

  const listState = useAsync(() => (epicKey ? designDocsApi.list(epicKey, kinds) : Promise.resolve(null)), [epicKey, kindsKey]);
  const documents = listState.data?.documents ?? [];

  useEffect(() => {
    if (epicKey && !docId && documents.length > 0) select({ doc: groupByKind(documents, kinds)[0]!.documents[0]!.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicKey, docId, documents.length]);

  const epicOptions = epicKey && !epics.some((e) => e.epicKey === epicKey) ? [{ epicKey, documents: 0, updatedAt: "" }, ...epics] : epics;

  return (
    <>
      <PageHeader title={title} description={description} />
      {notice}
      {epicsState.error ? (
        <Alert tone="danger">{epicsState.error}</Alert>
      ) : epicsState.loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading" />
        </div>
      ) : epicOptions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DocumentIcon className="size-5" />}
            title="No documents yet"
            description="Documents appear here once an agent's draft is approved at its gate."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]" style={{ minHeight: "70vh" }}>
            <aside className="border-b border-line lg:border-b-0 lg:border-r">
              <div className="border-b border-line p-3">
                <Select aria-label="Epic" value={epicKey ?? ""} onChange={(e) => select({ epic: e.target.value })}>
                  {epicOptions.map((e) => (
                    <option key={e.epicKey} value={e.epicKey}>
                      {e.epicKey}
                      {e.documents ? ` (${e.documents})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <DocumentList
                documents={documents}
                kinds={kinds}
                loading={listState.loading}
                error={listState.error}
                selectedId={docId}
                onSelect={(id) => select({ doc: id })}
              />
              {epicKey
                ? ADDABLE.filter((k) => kinds.includes(k) && editable.includes(k)).map((kind) => (
                    <NewDocument
                      key={kind}
                      epicKey={epicKey}
                      kind={kind}
                      onCreated={async (doc) => {
                        await listState.reload();
                        select({ doc: doc.id });
                      }}
                    />
                  ))
                : null}
            </aside>
            <section className="min-w-0">
              {docId ? (
                <DocumentView key={docId} id={docId} editable={editable} onSaved={() => void listState.reload()} />
              ) : (
                <EmptyState icon={<DocumentIcon className="size-5" />} title="Pick a document" />
              )}
            </section>
          </div>
        </Card>
      )}
    </>
  );
}

function DocumentList({
  documents,
  kinds,
  loading,
  error,
  selectedId,
  onSelect,
}: {
  documents: DesignDoc[];
  kinds: DocKind[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (error) return <Alert tone="danger" className="m-3">{error}</Alert>;
  if (loading && documents.length === 0) return <div className="flex justify-center py-8"><Spinner size="sm" /></div>;
  if (documents.length === 0) return <p className="p-4 text-sm text-ink-500">No documents for this Epic yet.</p>;
  return (
    <nav className="space-y-4 p-3">
      {groupByKind(documents, kinds).map((group) => (
        <div key={group.kind}>
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{KIND_LABELS[group.kind]}</p>
          <ul>
            {group.documents.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => onSelect(doc.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    doc.id === selectedId ? "bg-ink-100 font-medium text-ink-900" : "text-ink-700 hover:bg-ink-50",
                  )}
                >
                  <span className="truncate">{doc.title}</span>
                  {doc.issueKey ? <span className="shrink-0 text-xs text-ink-500">{doc.issueKey}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NewDocument({ epicKey, kind, onCreated }: { epicKey: string; kind: DocKind; onCreated: (doc: DesignDoc) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind === "adr" ? "New ADR" : "New scenario";

  if (!open) {
    return (
      <div className="px-3 pb-3">
        <Button size="sm" variant="ghost" icon={<PlusIcon className="size-4" />} onClick={() => setOpen(true)}>
          {label}
        </Button>
      </div>
    );
  }
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { document } = await designDocsApi.create({ epicKey, kind, title: title.trim(), content: `# ${title.trim()}\n` });
      setOpen(false);
      setTitle("");
      await onCreated(document);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 px-3 pb-3">
      <Input autoFocus placeholder={kind === "adr" ? "Use ... (a decision)" : "Scenario title"} value={title} onChange={(e) => setTitle(e.target.value)} />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" loading={busy} disabled={!title.trim()} onClick={() => void create()}>
          Create
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

type Tab = "preview" | "edit" | "history";

function DocumentView({ id, editable, onSaved }: { id: string; editable: DocKind[]; onSaved: () => void }) {
  const state = useAsync(() => designDocsApi.get(id), [id]);
  const [tab, setTab] = useState<Tab>("preview");
  const [viewing, setViewing] = useState<{ version: number; content: string } | null>(null);

  if (state.error) return <Alert tone="danger" className="m-5">{state.error}</Alert>;
  if (!state.data) return <div className="flex justify-center py-16"><Spinner label="Loading" /></div>;
  const { document: doc, content, versions } = state.data;
  const canEdit = editable.includes(doc.kind);

  const items: Array<{ value: Tab; label: string; count?: number }> = [
    { value: "preview", label: "Preview" },
    ...(canEdit ? [{ value: "edit" as const, label: "Edit" }] : []),
    { value: "history", label: "History", count: versions.length },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink-900">{doc.title}</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            {KIND_LABELS[doc.kind]} · {doc.epicKey}
            {doc.issueKey ? ` · ${doc.issueKey}` : ""} · updated {timeAgo(doc.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="outline">v{doc.currentVersion}</Badge>
          {canEdit ? null : <Badge tone="neutral">Read only</Badge>}
        </div>
      </div>
      <div className="px-5">
        <Tabs
          value={tab}
          onChange={(t) => {
            setTab(t);
            setViewing(null);
          }}
          items={items}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {tab === "preview" ? (
          <Markdown source={content} />
        ) : tab === "edit" ? (
          <Editor
            doc={doc}
            content={content}
            onSaved={async () => {
              await state.reload();
              onSaved();
              setTab("preview");
            }}
          />
        ) : viewing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone="warning">Version {viewing.version}</Badge>
              <Button size="sm" variant="ghost" onClick={() => setViewing(null)}>
                Back to history
              </Button>
            </div>
            <Markdown source={viewing.content} />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {[...versions].sort((a, b) => b.version - a.version).map((v) => (
              <li key={v.version} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-ink-900">Version {v.version}</span>
                  <span className="text-ink-500"> · {versionAuthor(v)} · {timeAgo(v.createdAt)}</span>
                  {v.note ? <p className="truncate text-xs text-ink-500">{v.note}</p> : null}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const r = await designDocsApi.version(id, v.version);
                    setViewing({ version: v.version, content: r.content });
                  }}
                >
                  View
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Editor({ doc, content, onSaved }: { doc: DesignDoc; content: string; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(content);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const dirty = draft !== content;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await designDocsApi.save(doc.id, { content: draft, baseVersion: doc.currentVersion, ...(note.trim() ? { note: note.trim() } : {}) });
      await onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Someone saved a newer version while you were editing. Copy your changes, reload the page, and apply them to the latest version."
          : describeError(err),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-500">Markdown. Saving adds version {doc.currentVersion + 1}; earlier versions stay in History.</p>
        <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
          {preview ? "Hide preview" : "Show preview"}
        </Button>
      </div>
      <div className={cn("grid gap-4", preview ? "lg:grid-cols-2" : "grid-cols-1")}>
        <Textarea aria-label="Document" className="min-h-[50vh] font-mono text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
        {preview ? (
          <div className="rounded-lg border border-line p-4">
            <Markdown source={draft} />
          </div>
        ) : null}
      </div>
      <Input placeholder="What changed (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button variant="primary" loading={busy} disabled={!dirty} onClick={() => void save()}>
          Save version
        </Button>
        <Button variant="ghost" disabled={!dirty || busy} onClick={() => setDraft(content)}>
          Discard changes
        </Button>
      </div>
    </div>
  );
}
