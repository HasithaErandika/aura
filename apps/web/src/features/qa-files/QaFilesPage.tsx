import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { useAuth } from "../../shared/auth/useAuth.ts";
import { describeError } from "../../shared/api/errors.ts";
import { classifyQaFile, qaFilesApi, type QaFile } from "./api.ts";
import { TestRunHistory } from "./TestRunHistory.tsx";
import { workspaceApi } from "../workspace/api.ts";
import { paths } from "../../app/paths.ts";
import { jiraApi } from "../jira/api.ts";
import { TaskModal } from "../jira/TaskModal.tsx";
import { STATUS_TONE } from "../jira/format.ts";
import { RunCiModal } from "../dev-files/RunCiModal.tsx";
import { scaffoldDisciplines } from "../dev-files/api.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Input, Select, Field } from "../../shared/ui/Field.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { FileTree } from "../../shared/ui/FileTree.tsx";
import { DocumentIcon, RunIcon, TreeIcon } from "../../shared/icons/index.tsx";
import { vscode } from "../../shared/lib/vscodeTheme.ts";

type EpicFiles = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; files: QaFile[] };
type CiDiscipline = "Frontend" | "Backend";

// Viewer, and (for the QA Engineer role) editor, for Gate 6's test plan + Playwright source, VS
// Code dark theme, mirroring Design Documents' tree/editor shape - plus test-run history (Gate 7),
// an inline "run CI" check (delegate_to_ci - ungated, available to QA Engineer and Tester alike,
// not just the Developer role on Scaffolded Project Files), and a visible Task list per Epic
// (TaskModal) instead of requiring either role to already know a Task key by heart.
// Role-tailored on one shared route (both qa_engineer and tester use it): QA Engineer gets the
// hand-edit controls (Gate 6 is theirs to author); both get the same Run tests/Run CI actions,
// since qa_engineer approves Gate 7 while tester can request it - the Orchestrator chat's own
// gate UI already explains whose approval a pending run is waiting on.
export function QaFilesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isTester = profile?.role === "tester";
  const canEdit = profile?.role === "qa_engineer";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filesByEpic, setFilesByEpic] = useState<Record<string, EpicFiles>>({});
  const [selected, setSelected] = useState<{ epicKey: string; path: string } | null>(null);
  const [taskKeyFilter, setTaskKeyFilter] = useState("");
  const [runTaskKey, setRunTaskKey] = useState("");
  const [viewingTask, setViewingTask] = useState<string | null>(null);
  const [ciDiscipline, setCiDiscipline] = useState<CiDiscipline>("Frontend");
  const [showCi, setShowCi] = useState(false);
  const autoOpened = useRef(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const epicsState = useAsync(() => qaFilesApi.listEpics(), []);
  const epics = epicsState.data?.epics ?? [];

  const loadFiles = useCallback(async (epicKey: string) => {
    setFilesByEpic((prev) => ({ ...prev, [epicKey]: { status: "loading" } }));
    try {
      const { files } = await qaFilesApi.list(epicKey);
      setFilesByEpic((prev) => ({ ...prev, [epicKey]: { status: "ready", files } }));
    } catch (err) {
      setFilesByEpic((prev) => ({ ...prev, [epicKey]: { status: "error", message: describeError(err) } }));
    }
  }, []);

  function toggleEpic(epicKey: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(epicKey)) next.delete(epicKey);
      else next.add(epicKey);
      return next;
    });
    if (!filesByEpic[epicKey]) void loadFiles(epicKey);
  }

  useEffect(() => {
    if (autoOpened.current || epics.length === 0) return;
    autoOpened.current = true;
    const first = epics[0]!;
    setExpanded(new Set([first]));
    void loadFiles(first);
  }, [epics, loadFiles]);

  const fileState = useAsync(() => (selected ? qaFilesApi.read(selected.epicKey, selected.path) : Promise.resolve(null)), [selected?.epicKey, selected?.path]);

  // Switching files drops any in-progress edit rather than carrying it to a different file.
  useEffect(() => {
    setEditing(false);
    setSaveError(null);
  }, [selected?.epicKey, selected?.path]);

  function startEditing() {
    if (!fileState.data) return;
    setDraft(fileState.data.content);
    setSaveError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    try {
      await qaFilesApi.write(selected.epicKey, selected.path, draft);
      setEditing(false);
      await fileState.reload();
    } catch (err) {
      setSaveError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function runTests() {
    const epicKey = selected?.epicKey;
    const taskKey = runTaskKey.trim().toUpperCase();
    if (!epicKey || !taskKey) return;
    const thread = await workspaceApi.createThread("orchestrator");
    navigate(paths.workspaceThread(thread.id), { state: { initialMessage: `Run the tests for Task ${taskKey} under Epic ${epicKey}.` } });
  }

  const epicTasksState = useAsync(() => (selected ? jiraApi.epic(selected.epicKey) : Promise.resolve(null)), [selected?.epicKey]);
  const epicTasks = epicTasksState.data?.tasks ?? [];

  return (
    <>
      <PageHeader
        title="QA Files & Test Runs"
        description={
          canEdit
            ? "Gate 6's test plan and Playwright source, and Gate 7's real test-run history - you can hand-edit a file directly."
            : "Gate 6's test plan and Playwright source, and Gate 7's real test-run history."
        }
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
          <EmptyState icon={<TreeIcon className="size-5" />} title="No QA workspaces yet" description="Once QA files an approved test plan (Gate 6), its Epic will show up here automatically." />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]" style={{ height: "65vh" }}>
              <div className="flex min-h-0 flex-col" style={{ backgroundColor: vscode.sidebarBg, borderRight: `1px solid ${vscode.border}` }}>
                <div className="shrink-0 px-3 py-2.5" style={{ borderBottom: `1px solid ${vscode.border}` }}>
                  <p className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: vscode.mutedText }}>
                    Explorer
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
                            <TreeIcon className="size-3.5 shrink-0" style={{ color: vscode.mutedText }} />
                            {epicKey}
                          </button>
                          {isOpen ? (
                            <div className="ml-4 pl-2" style={{ borderLeft: `1px solid ${vscode.border}` }}>
                              {!entry || entry.status === "loading" ? (
                                <div className="space-y-1.5 py-2 pl-2">
                                  <Skeleton className="h-3.5 w-32" />
                                </div>
                              ) : entry.status === "error" ? (
                                <p className="px-2 py-1.5 text-xs text-danger">{entry.message}</p>
                              ) : (
                                <FileTree
                                  files={entry.files}
                                  selectedPath={selected?.epicKey === epicKey ? selected.path : null}
                                  onSelect={(path) => setSelected({ epicKey, path })}
                                  emptyMessage="No test files yet"
                                />
                              )}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <div className="flex min-h-0 min-w-0 flex-col" style={{ backgroundColor: vscode.editorBg }}>
                {!selected ? (
                  <EmptyState icon={<DocumentIcon className="size-5" />} title="Select a file" description="Pick a test plan or spec file from the explorer." className="h-full py-16" />
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
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-semibold" style={{ color: vscode.text }}>
                          {fileState.data.path}
                        </p>
                        <p className="text-[11px]" style={{ color: vscode.mutedText }}>
                          {selected.epicKey}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={classifyQaFile(selected.path).tone}>{classifyQaFile(selected.path).label}</Badge>
                        {canEdit ? (
                          editing ? (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                                Cancel
                              </Button>
                              <Button size="sm" variant="primary" onClick={() => void saveEdit()} loading={saving}>
                                Save
                              </Button>
                            </>
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
                        Manual edits aren't versioned - if the QA Agent (Gate 6) revises this Epic's test plan again, this file is overwritten from that new draft.
                      </div>
                    ) : null}
                    {saveError ? (
                      <div className="shrink-0 px-4 pt-2">
                        <Alert tone="danger">{saveError}</Alert>
                      </div>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <CodeMirror
                        value={editing ? draft : fileState.data.content}
                        onChange={editing ? (value) => setDraft(value) : undefined}
                        editable={editing}
                        height="100%"
                        theme={vscodeDark}
                        extensions={selected.path.endsWith(".md") ? [markdown()] : [javascript({ jsx: true, typescript: true })]}
                        basicSetup={{ lineNumbers: true, foldGutter: true }}
                        className="h-full"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </Card>

          {selected ? (
            <Card>
              <div className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Tasks in {selected.epicKey}</h3>
                  <Badge tone="outline">{epicTasks.length}</Badge>
                </div>
                {epicTasksState.error ? (
                  <Alert tone="danger">{epicTasksState.error}</Alert>
                ) : epicTasksState.loading && !epicTasksState.data ? (
                  <Skeleton className="h-8 w-full" />
                ) : epicTasks.length === 0 ? (
                  <p className="text-xs text-ink-400">No Tasks filed under this Epic yet.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {epicTasks.map((t) => (
                      <li key={t.key} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                        <button type="button" onClick={() => setViewingTask(t.key)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:text-ink-950">
                          <span className="shrink-0 font-mono text-xs font-semibold text-ink-500">{t.key}</span>
                          <span className="min-w-0 flex-1 truncate text-ink-800">{t.summary || "(no summary)"}</span>
                          <Badge tone={STATUS_TONE[t.statusCategory]} className="shrink-0">
                            {t.status}
                          </Badge>
                        </button>
                        <Button size="sm" variant="ghost" onClick={() => setRunTaskKey(t.key)}>
                          Select
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          ) : null}

          {selected ? (
            <Card>
              <div className="flex flex-wrap items-end gap-3 p-4">
                <Field label="Run tests for Task" htmlFor="qa-run-task">
                  <Input id="qa-run-task" value={runTaskKey} onChange={(e) => setRunTaskKey(e.target.value)} placeholder="KAN-33" className="w-32" />
                </Field>
                <Button variant="primary" icon={<RunIcon className="size-3.5" />} onClick={() => void runTests()} disabled={!runTaskKey.trim()}>
                  Run tests
                </Button>
                <p className="text-xs text-ink-500">
                  Opens the Orchestrator chat pre-filled to run Gate 7 for this Task under {selected.epicKey}.{" "}
                  {isTester ? "A QA Engineer will need to approve it before it runs." : "You can approve it yourself."}
                </p>
              </div>
            </Card>
          ) : null}

          {selected ? (
            <Card>
              <div className="flex flex-wrap items-end gap-3 p-4">
                <Field label="Run CI for project" htmlFor="qa-ci-discipline">
                  <Select id="qa-ci-discipline" value={ciDiscipline} onChange={(e) => setCiDiscipline(e.target.value as CiDiscipline)} className="w-32">
                    {scaffoldDisciplines
                      .filter((d): d is CiDiscipline => d === "Frontend" || d === "Backend")
                      .map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Button variant="secondary" icon={<RunIcon className="size-3.5" />} onClick={() => setShowCi(true)}>
                  Run CI
                </Button>
                <p className="text-xs text-ink-500">
                  Runs the whole {ciDiscipline} project's checked-in CI locally, in Docker, right here - a fast, project-wide check that doesn't need Gate 7's approval, useful while a real test run is pending.
                </p>
              </div>
            </Card>
          ) : null}

          {selected ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Filter history by Task (optional)" htmlFor="qa-history-filter">
                  <Input id="qa-history-filter" value={taskKeyFilter} onChange={(e) => setTaskKeyFilter(e.target.value)} placeholder="KAN-33" className="w-32" />
                </Field>
              </div>
              <TestRunHistory epicKey={selected.epicKey} taskKey={taskKeyFilter.trim() || undefined} />
            </>
          ) : null}
        </>
      )}

      {showCi && selected ? <RunCiModal epicKey={selected.epicKey} discipline={ciDiscipline} onClose={() => setShowCi(false)} /> : null}
      {viewingTask ? <TaskModal issueKey={viewingTask} onClose={() => setViewingTask(null)} /> : null}
    </>
  );
}
