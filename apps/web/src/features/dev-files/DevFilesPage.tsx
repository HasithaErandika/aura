import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { useAuth } from "../../shared/auth/useAuth.ts";
import { describeError } from "../../shared/api/errors.ts";
import { devFilesApi, scaffoldDisciplines, type ScaffoldDiscipline } from "./api.ts";
import { languageExtension } from "./language.ts";
import { FileTree } from "../../shared/ui/FileTree.tsx";
import { RunCiModal } from "./RunCiModal.tsx";
import { TerminalPanel } from "./TerminalPanel.tsx";
import { RunnersPanel } from "./RunnersPanel.tsx";
import { PanelTabs, type PanelTab } from "./PanelTabs.tsx";
import { designDocsApi, sortedWorkspaceFiles } from "../design-docs/api.ts";
import { workspaceApi } from "../workspace/api.ts";
import { paths } from "../../app/paths.ts";
import { Markdown } from "../../shared/ui/Markdown.tsx";
import type { Role } from "../../shared/lib/roles.ts";
import { jiraApi } from "../jira/api.ts";
import { TaskModal } from "../jira/TaskModal.tsx";
import { STATUS_TONE } from "../jira/format.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Input, Select, Field, Textarea } from "../../shared/ui/Field.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { ChevronRightIcon, DocumentIcon, RunIcon, SendIcon, TreeIcon } from "../../shared/icons/index.tsx";
import { vscode } from "../../shared/lib/vscodeTheme.ts";
import { cn } from "../../shared/lib/cn.ts";

// Project Files - one place for everything an Epic has produced, laid out like VS Code: an
// Explorer, the CodeMirror editor, and (for the Developer role) an integrated terminal under it,
// all visible from the moment the page opens and filled in once an Epic/Task is loaded. It
// replaced the separate Design Documents page.
//
// The Explorer has two sections:
//   - Design documents: the Epic's Architect workspace (architecture.md, plan.md, SRS, ADRs -
//     Gate 3 output). Every pipeline role reads them; the Architect edits them; PO/BA/Architect
//     can send feedback to the Architect agent, which revises the design.
//   - Code: the Task's own git worktree (or the discipline's base scaffold) - Gate 4/5 output,
//     shown to the roles the API lets view it (dev-agent grant: Developer, Architect, QA, plus
//     admin) and hand-editable by the Developer.
// Highlighting uses VS Code's own dark theme and per-extension language support
// (@uiw/codemirror-theme-vscode + @codemirror/lang-*).

type Selection = { source: "code" | "design"; path: string } | null;

// The design-review population - PO/BA/Architect. Not Developer: reviewing architecture isn't
// that role's job even though it has an Orchestrator run grant, so this is checked by role.
const FEEDBACK_ROLES: Role[] = ["project_owner", "business_analyst", "architect"];

function SectionHeader({ label, open, onToggle, count }: { label: string; open: boolean; onToggle: () => void; count?: number }) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide uppercase hover:bg-white/5" style={{ color: vscode.text }}>
      <ChevronRightIcon className={cn("size-3 transition-transform", open && "rotate-90")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? <span style={{ color: vscode.mutedText }}>{count}</span> : null}
    </button>
  );
}

// Shown in the terminal slot before anything is loaded - the panel is part of the layout from
// the start, it just has no directory to open a shell in yet.
function TerminalPlaceholder({ tabs }: { tabs: ReactNode }) {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: vscode.editorBg, borderTop: `1px solid ${vscode.border}` }}>
      <div className="flex shrink-0 items-center gap-3 px-3 py-1.5" style={{ backgroundColor: vscode.tabBarBg, borderBottom: `1px solid ${vscode.border}` }}>
        {tabs}
      </div>
      <p className="px-4 py-3 font-mono text-xs" style={{ color: vscode.mutedText }}>
        Load an Epic (and optionally a Task) above - a shell opens here in its directory, with `aura` already signed in.
      </p>
    </div>
  );
}

export function DevFilesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canEdit = profile?.role === "developer";
  // Mirrors the API's canViewDevWorkspace / canEditArchitectWorkspace.
  const canSeeCode = Boolean(profile?.grants.agents["dev-agent"]) || profile?.role === "admin";
  const canEditDesign = profile?.role === "architect";
  const canSendFeedback = profile ? FEEDBACK_ROLES.includes(profile.role) : false;

  const [epicKey, setEpicKey] = useState(() => searchParams.get("epic")?.toUpperCase() ?? "");
  const [discipline, setDiscipline] = useState<ScaffoldDiscipline>("Frontend");
  const [taskKey, setTaskKey] = useState("");
  const [loaded, setLoaded] = useState<{ epicKey: string; discipline: ScaffoldDiscipline; taskKey?: string } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [showCi, setShowCi] = useState(false);
  const [viewingTask, setViewingTask] = useState<string | null>(null);
  // VS Code's bottom panel: TERMINAL (Developer only - it can change the code) and RUNNERS (what
  // AURA is running: Docker containers, council runs, checks - every role that sees code).
  const [showPanel, setShowPanel] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>(() => (profile?.role === "developer" ? "terminal" : "runners"));
  const [designOpen, setDesignOpen] = useState(true);
  const [codeOpen, setCodeOpen] = useState(true);
  // Design documents open as rendered Markdown by default; Ctrl+Shift+V toggles, as in VS Code.
  const [viewMode, setViewMode] = useState<"source" | "preview">("preview");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Every Epic with a design workspace, offered as suggestions in the Epic field.
  const epicsState = useAsync(() => designDocsApi.listEpics(), []);
  const epicState = useAsync(() => (loaded && canSeeCode ? jiraApi.epic(loaded.epicKey) : Promise.resolve(null)), [loaded?.epicKey]);
  const tasks = epicState.data?.tasks ?? [];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filesState = useAsync(
    () => (loaded && canSeeCode ? devFilesApi.list(loaded.epicKey, loaded.discipline, loaded.taskKey) : Promise.resolve(null)),
    [loaded?.epicKey, loaded?.discipline, loaded?.taskKey],
  );
  const designState = useAsync(() => (loaded ? designDocsApi.list(loaded.epicKey) : Promise.resolve(null)), [loaded?.epicKey]);
  const fileState = useAsync(
    () => {
      if (!loaded || !selection) return Promise.resolve(null);
      return selection.source === "design"
        ? designDocsApi.read(loaded.epicKey, selection.path)
        : devFilesApi.read(loaded.epicKey, loaded.discipline, selection.path, loaded.taskKey);
    },
    [loaded?.epicKey, loaded?.discipline, loaded?.taskKey, selection?.source, selection?.path],
  );

  // Switching files drops any in-progress edit or feedback draft rather than carrying it to a
  // different file.
  useEffect(() => {
    setEditing(false);
    setSaveError(null);
    setFeedbackOpen(false);
    setSendError(null);
  }, [loaded?.epicKey, loaded?.discipline, loaded?.taskKey, selection?.source, selection?.path]);

  // An ?epic= link (e.g. from Jira) opens that Epic straight away.
  useEffect(() => {
    const fromLink = searchParams.get("epic");
    if (fromLink) setLoaded((current) => current ?? { epicKey: fromLink.toUpperCase(), discipline: "Frontend" });
  }, [searchParams]);

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

  function startEditing() {
    if (!fileState.data) return;
    setDraft(fileState.data.content);
    setSaveError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!loaded || !selection) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (selection.source === "design") await designDocsApi.write(loaded.epicKey, selection.path, draft);
      else await devFilesApi.write(loaded.epicKey, loaded.discipline, selection.path, draft, loaded.taskKey);
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
    if (!loaded || !feedback.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const { threadId } = await designDocsApi.thread(loaded.epicKey);
      if (threadId) {
        navigate(paths.workspaceThread(threadId), { state: { initialMessage: `Revise. Feedback: ${feedback.trim()}` } });
      } else {
        const thread = await workspaceApi.createThread("orchestrator");
        navigate(paths.workspaceThread(thread.id), {
          state: { initialMessage: `Design the architecture for ${loaded.epicKey} (its Stories are already approved). Feedback to incorporate: ${feedback.trim()}` },
        });
      }
    } catch (err) {
      setSendError(describeError(err));
      setSending(false);
    }
  }

  function load(forTaskKey?: string) {
    const trimmed = epicKey.trim().toUpperCase();
    if (!trimmed) return;
    const task = (forTaskKey ?? taskKey).trim().toUpperCase() || undefined;
    setSelection(null);
    setLoaded({ epicKey: trimmed, discipline, taskKey: task });
  }

  const files = filesState.data?.files ?? [];
  const designFiles = sortedWorkspaceFiles(designState.data?.files ?? []);
  const isDesign = selection?.source === "design";
  const canEditSelection = isDesign ? canEditDesign : canEdit;
  const panelVisible = canSeeCode && showPanel;
  const panelTabs: PanelTab[] = canEdit ? ["terminal", "runners"] : ["runners"];
  const activeTab: PanelTab = canEdit ? panelTab : "runners";
  const tabs = <PanelTabs tabs={panelTabs} active={activeTab} onChange={setPanelTab} />;

  return (
    <>
      <PageHeader
        title="Project Files"
        description={
          canEdit
            ? "An Epic's design documents and a Task's code (Gate 4 scaffold, as edited by Gate 5's coding agent) side by side - edit the code here or in the terminal."
            : canSeeCode
              ? "An Epic's design documents and a Task's code (Gate 4/5 output), side by side."
              : "An Epic's design documents: architecture, plan, requirements and ADRs (Gate 3 output)."
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Epic key" htmlFor="dev-files-epic">
            <Input id="dev-files-epic" list="dev-files-epics" value={epicKey} onChange={(e) => setEpicKey(e.target.value)} placeholder="KAN-3" className="w-32" onKeyDown={(e) => e.key === "Enter" && load()} />
            <datalist id="dev-files-epics">
              {(epicsState.data?.epics ?? []).map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
          </Field>
          {canSeeCode ? (
            <>
          <Field label="Discipline" htmlFor="dev-files-discipline">
            <Select id="dev-files-discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value as ScaffoldDiscipline)} className="w-40">
              {scaffoldDisciplines.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Task (worktree)" htmlFor="dev-files-task">
            <Input id="dev-files-task" value={taskKey} onChange={(e) => setTaskKey(e.target.value)} placeholder="KAN-45 (blank = base scaffold)" className="w-56" onKeyDown={(e) => e.key === "Enter" && load()} />
          </Field>
            </>
          ) : null}
          <Button variant="primary" onClick={() => load()} disabled={!epicKey.trim()}>
            Load
          </Button>
        </div>
        <p className="px-4 pb-3 text-xs text-ink-500">
          {canSeeCode
            ? "Leave Task blank to browse the shared base scaffold. Once a Task has run delegate_to_dev, its own code lives in an isolated git worktree - enter its key to browse that instead."
            : "Pick an Epic to read its design documents."}
        </p>
      </Card>

      {/* The IDE - Explorer, editor and terminal - is always laid out, even before anything is
          loaded, so the page opens straight into the developer's working view. */}
      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]" style={{ height: panelVisible ? "85vh" : "70vh" }}>
          {/* Explorer - VS Code's own shape: design documents first, then the code tree. */}
          <div className="flex min-h-0 flex-col" style={{ backgroundColor: vscode.sidebarBg, borderRight: `1px solid ${vscode.border}` }}>
            <div className="shrink-0 px-3 py-2.5" style={{ borderBottom: `1px solid ${vscode.border}` }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: vscode.mutedText }}>
                  Explorer
                </p>
                {canSeeCode ? (
                  <button type="button" onClick={() => setShowPanel((v) => !v)} className="rounded px-1.5 py-0.5 text-[11px] hover:bg-white/10" style={{ color: vscode.text }} title="Show or hide the Terminal / Runners panel">
                    {showPanel ? "Hide panel" : canEdit ? "Terminal · Runners" : "Runners"}
                  </button>
                ) : null}
              </div>
              <p className="mt-0.5 truncate font-mono text-xs font-semibold" style={{ color: vscode.text }}>
                {loaded ? (
                  <>
                    {loaded.epicKey} / {loaded.discipline.toLowerCase()}
                    {loaded.taskKey ? ` / ${loaded.taskKey} (worktree)` : " (base scaffold)"}
                  </>
                ) : (
                  "nothing loaded"
                )}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {!loaded ? (
                <p className="px-2 py-1.5 text-xs" style={{ color: vscode.mutedText }}>
                  Enter an Epic key above and press Load.
                </p>
              ) : (
                <>
                  <SectionHeader label="Design documents" open={designOpen} onToggle={() => setDesignOpen((v) => !v)} count={designFiles.length} />
                  {designOpen ? (
                    designState.loading && !designState.data ? (
                      <div className="space-y-1.5 p-2">
                        <Skeleton className="h-3.5 w-32" />
                      </div>
                    ) : designState.error || designFiles.length === 0 ? (
                      <p className="px-3 py-1.5 text-xs" style={{ color: vscode.mutedText }}>
                        No design documents for {loaded.epicKey} yet (Gate 3).
                      </p>
                    ) : (
                      <FileTree
                        key={`design-${loaded.epicKey}`}
                        files={designFiles}
                        selectedPath={isDesign ? selection!.path : null}
                        onSelect={(path) => setSelection({ source: "design", path })}
                      />
                    )
                  ) : null}

                  {canSeeCode ? <div className="mt-1" /> : null}
                  {canSeeCode ? <SectionHeader label={`Code · ${loaded.taskKey ?? `${loaded.discipline.toLowerCase()} base`}`} open={codeOpen} onToggle={() => setCodeOpen((v) => !v)} count={files.length} /> : null}
                  {canSeeCode && codeOpen ? (
                    filesState.error ? (
                      <p className="px-2 py-1.5 text-xs text-danger">{filesState.error}</p>
                    ) : filesState.loading && !filesState.data ? (
                      <div className="space-y-1.5 p-2">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3.5 w-28" />
                      </div>
                    ) : (
                      <FileTree
                        key={`code-${loaded.epicKey}-${loaded.discipline}-${loaded.taskKey ?? "base"}`}
                        files={files}
                        selectedPath={selection?.source === "code" ? selection.path : null}
                        onSelect={(path) => setSelection({ source: "code", path })}
                        emptyMessage="No files found - has this Task been scaffolded yet?"
                      />
                    )
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* Editor pane with the integrated terminal under it, like VS Code's bottom panel. */}
          <div className="flex min-h-0 min-w-0 flex-col" style={{ backgroundColor: vscode.editorBg }}>
            <div className="flex min-h-0 flex-1 flex-col">
              {!selection ? (
                <EmptyState
                  icon={loaded ? <DocumentIcon className="size-5" /> : <TreeIcon className="size-5" />}
                  title={loaded ? "Select a file" : "Editor"}
                  description={loaded ? (canSeeCode ? "Pick a design document or a code file from the Explorer." : "Pick a design document from the Explorer.") : "Load an Epic above to browse its files here."}
                  className="h-full py-16"
                />
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
                  <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5" style={{ backgroundColor: vscode.tabBarBg, borderBottom: `1px solid ${vscode.border}` }}>
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate font-mono text-sm font-semibold" style={{ color: vscode.text }}>
                        {fileState.data.path}
                      </p>
                      {isDesign ? <Badge tone="outline">{canEditDesign ? "Design document" : "Design document · read-only"}</Badge> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                    {isDesign && !editing ? (
                      <div className="flex items-center rounded-md p-0.5 text-xs" style={{ backgroundColor: vscode.editorBg, border: `1px solid ${vscode.border}` }}>
                        {(["source", "preview"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setViewMode(mode)}
                            style={viewMode === mode ? { backgroundColor: vscode.selectedBg, color: vscode.selectedText } : { color: vscode.mutedText }}
                            className="rounded px-2.5 py-1 font-medium capitalize transition-colors"
                            title="Ctrl+Shift+V"
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {isDesign && canSendFeedback && !editing ? (
                      <Button size="sm" variant="secondary" icon={<SendIcon className="size-3.5" />} onClick={() => setFeedbackOpen((v) => !v)}>
                        Comment
                      </Button>
                    ) : null}
                    {canEditSelection ? (
                      editing ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="primary" onClick={() => void saveEdit()} loading={saving}>
                            Save
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={startEditing}>
                          Edit
                        </Button>
                      )
                    ) : null}
                    </div>
                  </div>
                  {editing ? (
                    <div className="shrink-0 border-b border-line bg-warning-soft px-4 py-2 text-xs text-warning">
                      {isDesign
                        ? "Manual edits aren't versioned - if the Architect agent revises this design again, this file is overwritten from that new draft."
                        : "Manual edits aren't versioned - if the Coding Agent (Gate 5) runs against this Task again, this file is overwritten from that run."}
                    </div>
                  ) : null}
                  {feedbackOpen && isDesign && !editing ? (
                    <div className="shrink-0 space-y-2 px-4 py-3" style={{ backgroundColor: vscode.sidebarBg, borderBottom: `1px solid ${vscode.border}` }}>
                      <p className="text-xs font-medium" style={{ color: vscode.text }}>
                        Send feedback to the Architect - it will revise this design and update the filed Jira Tasks in place.
                      </p>
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
                  {saveError ? (
                    <div className="shrink-0 px-4 pt-2">
                      <Alert tone="danger">{saveError}</Alert>
                    </div>
                  ) : null}
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {isDesign && !editing && viewMode === "preview" ? (
                      <div
                        className="h-full overflow-y-auto px-6 py-4 [&_code]:bg-white/10 [&_code]:text-[#ce9178] [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_hr]:border-white/10 [&_li]:text-[#cccccc] [&_p]:text-[#cccccc] [&_pre]:border-white/10 [&_pre]:bg-black/30 [&_pre]:text-[#d4d4d4] [&_strong]:text-white"
                        style={{ backgroundColor: vscode.editorBg }}
                      >
                        <Markdown source={fileState.data.content} />
                      </div>
                    ) : (
                    <CodeMirror
                      value={editing ? draft : fileState.data.content}
                      onChange={editing ? (value) => setDraft(value) : undefined}
                      editable={editing}
                      height="100%"
                      theme={vscodeDark}
                      extensions={languageExtension(selection.path)}
                      basicSetup={{ lineNumbers: true, foldGutter: true }}
                      className="h-full text-sm"
                    />
                    )}
                  </div>
                </>
              ) : null}
            </div>
            {panelVisible ? (
              <div className="shrink-0" style={{ height: "40%" }}>
                {/* The terminal stays mounted while Runners is shown, so switching tabs never
                    drops the shell session. */}
                {canEdit ? (
                  <div className={activeTab === "terminal" ? "h-full" : "hidden"}>
                    {loaded ? (
                      <TerminalPanel
                        epicKey={loaded.epicKey}
                        discipline={loaded.discipline}
                        taskKey={loaded.taskKey}
                        tabs={tabs}
                        onCommandFinished={() => {
                          void filesState.reload();
                          if (selection?.source === "code" && !editing) void fileState.reload();
                        }}
                      />
                    ) : (
                      <TerminalPlaceholder tabs={tabs} />
                    )}
                  </div>
                ) : null}
                {activeTab === "runners" ? <RunnersPanel epicKey={loaded?.epicKey} active tabs={tabs} /> : null}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {loaded && canSeeCode ? (
        <>
          {loaded.discipline === "Frontend" || loaded.discipline === "Backend" ? (
            <Card>
              <div className="flex flex-wrap items-center gap-3 p-4">
                <Button variant="primary" icon={<RunIcon className="size-3.5" />} onClick={() => setShowCi(true)}>
                  Run CI
                </Button>
                <p className="text-xs text-ink-500">
                  Runs the {loaded.discipline} project's checked-in CI (.github/workflows) locally, in Docker, right here - against {loaded.taskKey ? `${loaded.taskKey}'s own worktree` : "the shared base scaffold"}, no approval gate, nothing pushed anywhere.
                </p>
              </div>
            </Card>
          ) : null}

          {/* The Tasks this Epic's Jira board actually has, so a developer can see and open the
              one they're working on without leaving this page or memorizing its key. */}
          <Card>
            <div className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Tasks in {loaded.epicKey}</h3>
                <Badge tone="outline">{tasks.length}</Badge>
              </div>
              {epicState.error ? (
                <Alert tone="danger">{epicState.error}</Alert>
              ) : epicState.loading && !epicState.data ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : tasks.length === 0 ? (
                <p className="text-xs text-ink-400">No Tasks filed under this Epic yet.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {tasks.map((t) => (
                    <li key={t.key} className="flex items-center gap-1 px-1">
                      <button type="button" onClick={() => setViewingTask(t.key)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left text-sm hover:bg-ink-50">
                        <span className="shrink-0 font-mono text-xs font-semibold text-ink-500">{t.key}</span>
                        <span className="min-w-0 flex-1 truncate text-ink-800">{t.summary || "(no summary)"}</span>
                        <Badge tone={STATUS_TONE[t.statusCategory]} className="shrink-0">
                          {t.status}
                        </Badge>
                      </button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setTaskKey(t.key);
                          load(t.key);
                        }}
                      >
                        Browse worktree
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      ) : null}

      {showCi && loaded && (loaded.discipline === "Frontend" || loaded.discipline === "Backend") ? (
        <RunCiModal epicKey={loaded.epicKey} discipline={loaded.discipline} taskKey={loaded.taskKey} onClose={() => setShowCi(false)} />
      ) : null}
      {viewingTask ? <TaskModal issueKey={viewingTask} onClose={() => setViewingTask(null)} /> : null}
    </>
  );
}
