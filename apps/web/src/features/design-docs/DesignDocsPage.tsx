import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Role } from "../../shared/lib/roles.ts";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { vscode } from "../../shared/lib/vscodeTheme.ts";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { useAuth } from "../../shared/auth/useAuth.ts";
import { describeError } from "../../shared/api/errors.ts";
import { classifyWorkspaceFile, designDocsApi, sortedWorkspaceFiles, workspaceFileTitle, type WorkspaceFile } from "./api.ts";
import { workspaceApi } from "../workspace/api.ts";
import { paths } from "../../app/paths.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Textarea } from "../../shared/ui/Field.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { Markdown } from "../../shared/ui/Markdown.tsx";
import { ChevronRightIcon, CodeIcon, DocumentIcon, LayersIcon, SendIcon, TicketIcon, TreeIcon } from "../../shared/icons/index.tsx";
import { cn } from "../../shared/lib/cn.ts";

// Icon per classifyWorkspaceFile() kind - the label/tone/ordering live in features/design-docs/api.ts
// so the Jira page's embedded Documents section classifies files identically; only the icon
// choice is specific to this page's tree view.
const KIND_ICON: Record<ReturnType<typeof classifyWorkspaceFile>["kind"], typeof DocumentIcon> = {
  architecture: LayersIcon,
  plan: TicketIcon,
  requirements: DocumentIcon,
  adr: CodeIcon,
  doc: DocumentIcon,
};

type EpicFiles = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; files: WorkspaceFile[] };

// The design-review population - PO/BA/Architect - not Developer: Developer also has an
// orchestrator run grant (for Gate 4 scaffolding), but reviewing/commenting on architecture
// docs isn't part of that role's job, so it's checked by role directly rather than by grant.
const FEEDBACK_ROLES: Role[] = ["project_owner", "business_analyst", "architect"];

export function DesignDocsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const canEdit = profile?.role === "architect";
  const canSendFeedback = profile ? FEEDBACK_ROLES.includes(profile.role) : false;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filesByEpic, setFilesByEpic] = useState<Record<string, EpicFiles>>({});
  const [selected, setSelected] = useState<{ epicKey: string; path: string } | null>(null);
  const [viewMode, setViewMode] = useState<"source" | "preview">("preview");
  const autoOpened = useRef(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const epicsState = useAsync(() => designDocsApi.listEpics(), []);
  const epics = epicsState.data?.epics ?? [];

  const loadFiles = useCallback(async (epicKey: string) => {
    setFilesByEpic((prev) => ({ ...prev, [epicKey]: { status: "loading" } }));
    try {
      const { files } = await designDocsApi.list(epicKey);
      setFilesByEpic((prev) => ({ ...prev, [epicKey]: { status: "ready", files: sortedWorkspaceFiles(files) } }));
      return files;
    } catch (err) {
      setFilesByEpic((prev) => ({ ...prev, [epicKey]: { status: "error", message: describeError(err) } }));
      return [];
    }
  }, []);

  const toggleEpic = useCallback(
    (epicKey: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(epicKey)) next.delete(epicKey);
        else next.add(epicKey);
        return next;
      });
      if (!filesByEpic[epicKey]) void loadFiles(epicKey);
    },
    [filesByEpic, loadFiles],
  );

  // "Shows what is always there" - open the explorer straight into an Epic's first document,
  // VS Code's own default, rather than making the human click through an empty tree. Deep-links
  // from elsewhere (the Jira page's Documents section) land on their Epic via ?epic=; otherwise
  // the first Epic in the list opens, same as before.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (autoOpened.current || epics.length === 0) return;
    autoOpened.current = true;
    const requested = searchParams.get("epic")?.trim().toUpperCase();
    const first = (requested && epics.includes(requested) ? requested : epics[0])!;
    setExpanded(new Set([first]));
    void loadFiles(first).then((files) => {
      const sorted = sortedWorkspaceFiles(files);
      if (sorted[0]) setSelected({ epicKey: first, path: sorted[0].path });
    });
  }, [epics, loadFiles, searchParams]);

  const fileState = useAsync(() => (selected ? designDocsApi.read(selected.epicKey, selected.path) : Promise.resolve(null)), [selected?.epicKey, selected?.path]);

  // Switching documents drops any in-progress edit or feedback draft rather than carrying it
  // to a different file.
  useEffect(() => {
    setEditing(false);
    setSaveError(null);
    setFeedbackOpen(false);
    setFeedback("");
    setSendError(null);
  }, [selected?.epicKey, selected?.path]);

  function startEditing() {
    if (!fileState.data) return;
    setDraft(fileState.data.content);
    setSaveError(null);
    setEditing(true);
    setViewMode("source");
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    try {
      await designDocsApi.write(selected.epicKey, selected.path, draft);
      setEditing(false);
      await fileState.reload();
    } catch (err) {
      setSaveError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  // Sends feedback to the Architect by continuing the Orchestrator thread that produced this
  // Epic's design (so it still has the draftId to revise), or starting a fresh one if none is
  // found - the Orchestrator can still re-draft from the feedback and the Epic key.
  async function sendFeedback() {
    if (!selected || !feedback.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const { threadId } = await designDocsApi.thread(selected.epicKey);
      if (threadId) {
        navigate(paths.workspaceThread(threadId), { state: { initialMessage: `Revise. Feedback: ${feedback.trim()}` } });
      } else {
        const thread = await workspaceApi.createThread("orchestrator");
        navigate(paths.workspaceThread(thread.id), {
          state: { initialMessage: `Design the architecture for ${selected.epicKey} (its Stories are already approved). Feedback to incorporate: ${feedback.trim()}` },
        });
      }
    } catch (err) {
      setSendError(describeError(err));
      setSending(false);
    }
  }

  // Ctrl+Shift+V toggles Markdown preview, matching the same shortcut in VS Code.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        setViewMode((m) => (m === "source" ? "preview" : "source"));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const totalFiles = useMemo(() => Object.values(filesByEpic).reduce((n, e) => n + (e.status === "ready" ? e.files.length : 0), 0), [filesByEpic]);

  return (
    <>
      <PageHeader
        title="Design Documents"
        description="The Architect's per-Epic workspace: ADRs, requirements analysis, architecture.md, and plan.md"
      />

      {epicsState.error ? <Alert tone="danger">{epicsState.error}</Alert> : null}

      {epicsState.loading && !epicsState.data ? (
        <Card>
          <div className="space-y-2 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </Card>
      ) : epics.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TreeIcon className="size-5" />}
            title="No Epic workspaces yet"
            description="Once the Architect files an approved design (Gate 3), its Epic will show up here automatically."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]" style={{ height: "78vh" }}>
            {/* Sidebar: the explorer tree - VS Code dark Explorer chrome, one bordered pane
                instead of a separate card. */}
            <div className="flex min-h-0 flex-col" style={{ backgroundColor: vscode.sidebarBg, borderRight: `1px solid ${vscode.border}` }}>
              <div className="shrink-0 px-3 py-2.5" style={{ borderBottom: `1px solid ${vscode.border}` }}>
                <p className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: vscode.mutedText }}>
                  Explorer
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: vscode.mutedText }}>
                  {epics.length} Epic{epics.length === 1 ? "" : "s"} · {totalFiles} file{totalFiles === 1 ? "" : "s"} loaded
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                <ul className="text-sm">
                  {epics.map((epicKey) => {
                    const isOpen = expanded.has(epicKey);
                    const entry = filesByEpic[epicKey];
                    return (
                      <li key={epicKey}>
                        <button
                          type="button"
                          onClick={() => toggleEpic(epicKey)}
                          style={{ color: vscode.text }}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left font-mono text-xs font-semibold hover:brightness-125"
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = vscode.hoverBg)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          <ChevronRightIcon className={cn("size-3.5 shrink-0 transition-transform", isOpen && "rotate-90")} style={{ color: vscode.mutedText }} />
                          <TreeIcon className="size-3.5 shrink-0" style={{ color: vscode.mutedText }} />
                          {epicKey}
                        </button>
                        {isOpen ? (
                          <div className="ml-4 pl-2" style={{ borderLeft: `1px solid ${vscode.border}` }}>
                            {!entry || entry.status === "loading" ? (
                              <div className="space-y-1.5 py-2 pl-2">
                                <Skeleton className="h-3.5 w-32" />
                                <Skeleton className="h-3.5 w-28" />
                              </div>
                            ) : entry.status === "error" ? (
                              <p className="px-2 py-1.5 text-xs text-danger">{entry.message}</p>
                            ) : entry.files.length === 0 ? (
                              <p className="px-2 py-1.5 text-xs" style={{ color: vscode.mutedText }}>No documents yet</p>
                            ) : (
                              <ul>
                                {entry.files.map((f) => {
                                  const meta = classifyWorkspaceFile(f.path);
                                  const Icon = KIND_ICON[meta.kind];
                                  const isSelected = selected?.epicKey === epicKey && selected.path === f.path;
                                  return (
                                    <li key={f.path}>
                                      <button
                                        type="button"
                                        onClick={() => setSelected({ epicKey, path: f.path })}
                                        style={{ backgroundColor: isSelected ? vscode.selectedBg : "transparent", color: isSelected ? vscode.selectedText : vscode.text }}
                                        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs"
                                        onMouseEnter={(e) => !isSelected && (e.currentTarget.style.backgroundColor = vscode.hoverBg)}
                                        onMouseLeave={(e) => !isSelected && (e.currentTarget.style.backgroundColor = "transparent")}
                                        title={f.path}
                                      >
                                        <Icon className="size-3.5 shrink-0" style={{ color: isSelected ? vscode.accent : vscode.mutedText }} />
                                        <span className="truncate capitalize">{workspaceFileTitle(f.path)}</span>
                                        <Badge tone={meta.tone} className="ml-auto shrink-0">
                                          {meta.label}
                                        </Badge>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* Editor: the selected document - VS Code dark editor chrome, same pane, no
                separate card border. */}
            <div className="flex min-h-0 min-w-0 flex-col" style={{ backgroundColor: vscode.editorBg }}>
              {!selected ? (
                <EmptyState icon={<DocumentIcon className="size-5" />} title="Select a document" description="Pick a file from the explorer to view its contents." className="h-full py-16" />
              ) : fileState.error ? (
                <div className="p-5">
                  <Alert tone="danger">{fileState.error}</Alert>
                </div>
              ) : fileState.loading && !fileState.data ? (
                <div className="p-5">
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : fileState.data ? (
                <>
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-2.5" style={{ backgroundColor: vscode.tabBarBg, borderBottom: `1px solid ${vscode.border}` }}>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-semibold" style={{ color: vscode.text }}>{fileState.data.path}</p>
                      <p className="text-[11px]" style={{ color: vscode.mutedText }}>{selected.epicKey}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {editing ? (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="primary" onClick={() => void saveEdit()} loading={saving}>
                            Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center rounded-md p-0.5 text-xs" style={{ border: `1px solid ${vscode.border}` }}>
                            <button
                              type="button"
                              onClick={() => setViewMode("source")}
                              style={viewMode === "source" ? { backgroundColor: vscode.selectedBg, color: vscode.selectedText } : { color: vscode.mutedText }}
                              className="rounded px-2.5 py-1 font-medium transition-colors"
                            >
                              Source
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewMode("preview")}
                              style={viewMode === "preview" ? { backgroundColor: vscode.selectedBg, color: vscode.selectedText } : { color: vscode.mutedText }}
                              className="rounded px-2.5 py-1 font-medium transition-colors"
                              title="Ctrl+Shift+V"
                            >
                              Preview
                            </button>
                          </div>
                          {canSendFeedback ? (
                            <Button size="sm" variant="secondary" icon={<SendIcon className="size-3.5" />} onClick={() => setFeedbackOpen((v) => !v)}>
                              Comment
                            </Button>
                          ) : null}
                          {canEdit ? (
                            <Button size="sm" variant="secondary" onClick={startEditing}>
                              Edit
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>

                  {editing ? (
                    <div className="shrink-0 border-b border-line bg-warning-soft px-4 py-2 text-xs text-warning">
                      Manual edits aren't versioned - if the Architect agent revises this design again, this file is overwritten from that new draft.
                    </div>
                  ) : null}
                  {saveError ? (
                    <div className="shrink-0 px-4 pt-2">
                      <Alert tone="danger">{saveError}</Alert>
                    </div>
                  ) : null}

                  {feedbackOpen && !editing ? (
                    <div className="shrink-0 space-y-2 px-4 py-3" style={{ backgroundColor: vscode.sidebarBg, borderBottom: `1px solid ${vscode.border}` }}>
                      <p className="text-xs font-medium" style={{ color: vscode.text }}>Send feedback to the Architect - it will revise this design and update the filed Jira Tasks in place.</p>
                      <Textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What should change, and why?" className="text-sm" />
                      {sendError ? <p className="text-xs text-danger">{sendError}</p> : null}
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setFeedbackOpen(false)} disabled={sending}>
                          Cancel
                        </Button>
                        <Button size="sm" variant="primary" icon={<SendIcon className="size-3.5" />} onClick={() => void sendFeedback()} loading={sending} disabled={!feedback.trim()}>
                          Send to Architect
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="min-h-0 flex-1 overflow-hidden">
                    {editing ? (
                      <CodeMirror value={draft} onChange={(value) => setDraft(value)} height="100%" theme={vscodeDark} extensions={[markdown()]} basicSetup={{ lineNumbers: true, foldGutter: false }} className="h-full" />
                    ) : viewMode === "source" ? (
                      <CodeMirror value={fileState.data.content} editable={false} height="100%" theme={vscodeDark} extensions={[markdown()]} basicSetup={{ lineNumbers: true, foldGutter: false }} className="h-full" />
                    ) : (
                      <div
                        className="h-full overflow-y-auto px-6 py-4 [&_code]:bg-white/10 [&_code]:text-[#ce9178] [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_hr]:border-white/10 [&_li]:text-[#cccccc] [&_p]:text-[#cccccc] [&_pre]:border-white/10 [&_pre]:bg-black/30 [&_pre]:text-[#d4d4d4] [&_strong]:text-white"
                        style={{ backgroundColor: vscode.editorBg }}
                      >
                        <Markdown source={fileState.data.content} />
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
