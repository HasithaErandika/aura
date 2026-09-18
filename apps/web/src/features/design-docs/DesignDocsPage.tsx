import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { describeError } from "../../shared/api/errors.ts";
import { designDocsApi, type WorkspaceFile } from "./api.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Badge, type Tone } from "../../shared/ui/Badge.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { Markdown } from "../../shared/ui/Markdown.tsx";
import { ChevronRightIcon, CodeIcon, DocumentIcon, LayersIcon, TicketIcon, TreeIcon } from "../../shared/icons/index.tsx";
import { cn } from "../../shared/lib/cn.ts";

// Classifies a workspace file path into the kind of document the Architect Workflow produces
// (workflows/architect-workflow.ts + delegate-tools.ts's `file` mode), for a label and icon a
// reader can scan at a glance instead of parsing the raw path.
function classify(path: string): { label: string; tone: Tone; icon: typeof DocumentIcon } {
  if (path === "architecture.md") return { label: "Architecture", tone: "brand", icon: LayersIcon };
  if (path === "plan.md") return { label: "Plan", tone: "success", icon: TicketIcon };
  if (path.startsWith("docs/srs/")) return { label: "Requirements", tone: "warning", icon: DocumentIcon };
  if (path.startsWith("docs/adr/")) return { label: "ADR", tone: "outline", icon: CodeIcon };
  return { label: "Doc", tone: "neutral", icon: DocumentIcon };
}

function fileTitle(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/, "").replace(/^\d+-/, "").replace(/-/g, " ");
}

function sortedFiles(files: WorkspaceFile[]): WorkspaceFile[] {
  // A fixed, sensible reading order (architecture/plan/requirements first, ADRs after) rather
  // than plain alphabetical, which would separate architecture.md from its companions.
  const rank = (p: string) => (p === "architecture.md" ? 0 : p === "plan.md" ? 1 : p.startsWith("docs/srs/") ? 2 : p.startsWith("docs/adr/") ? 3 : 4);
  return [...files].sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
}

type EpicFiles = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; files: WorkspaceFile[] };

export function DesignDocsPage() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filesByEpic, setFilesByEpic] = useState<Record<string, EpicFiles>>({});
  const [selected, setSelected] = useState<{ epicKey: string; path: string } | null>(null);
  const [viewMode, setViewMode] = useState<"source" | "preview">("source");
  const autoOpened = useRef(false);

  const epicsState = useAsync(() => designDocsApi.listEpics(), []);
  const epics = epicsState.data?.epics ?? [];

  const loadFiles = useCallback(async (epicKey: string) => {
    setFilesByEpic((prev) => ({ ...prev, [epicKey]: { status: "loading" } }));
    try {
      const { files } = await designDocsApi.list(epicKey);
      setFilesByEpic((prev) => ({ ...prev, [epicKey]: { status: "ready", files: sortedFiles(files) } }));
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

  // "Shows what is always there" - open the explorer straight into the first Epic's first
  // document, VS Code's own default, rather than making the human click through an empty tree.
  useEffect(() => {
    if (autoOpened.current || epics.length === 0) return;
    autoOpened.current = true;
    const first = epics[0]!;
    setExpanded(new Set([first]));
    void loadFiles(first).then((files) => {
      const sorted = sortedFiles(files);
      if (sorted[0]) setSelected({ epicKey: first, path: sorted[0].path });
    });
  }, [epics, loadFiles]);

  const fileState = useAsync(() => (selected ? designDocsApi.read(selected.epicKey, selected.path) : Promise.resolve(null)), [selected?.epicKey, selected?.path]);

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
        description="The Architect's per-Epic workspace: ADRs, requirements analysis, architecture.md, and plan.md - written after Gate 3 approval (docs/ARCHITECTURE.md section 6.3)."
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
            {/* Sidebar: the explorer tree - one bordered pane instead of a separate card. */}
            <div className="flex min-h-0 flex-col border-b border-line bg-neutral-soft/40 lg:border-b-0 lg:border-r">
              <div className="shrink-0 border-b border-line px-3 py-2.5">
                <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Explorer</p>
                <p className="mt-0.5 text-[11px] text-ink-400">
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
                          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-mono text-xs font-semibold text-ink-800 hover:bg-ink-100"
                        >
                          <ChevronRightIcon className={cn("size-3.5 shrink-0 text-ink-400 transition-transform", isOpen && "rotate-90")} />
                          <TreeIcon className="size-3.5 shrink-0 text-ink-400" />
                          {epicKey}
                        </button>
                        {isOpen ? (
                          <div className="ml-4 border-l border-line pl-2">
                            {!entry || entry.status === "loading" ? (
                              <div className="space-y-1.5 py-2 pl-2">
                                <Skeleton className="h-3.5 w-32" />
                                <Skeleton className="h-3.5 w-28" />
                              </div>
                            ) : entry.status === "error" ? (
                              <p className="px-2 py-1.5 text-xs text-danger">{entry.message}</p>
                            ) : entry.files.length === 0 ? (
                              <p className="px-2 py-1.5 text-xs text-ink-400">No documents yet</p>
                            ) : (
                              <ul>
                                {entry.files.map((f) => {
                                  const meta = classify(f.path);
                                  const Icon = meta.icon;
                                  const isSelected = selected?.epicKey === epicKey && selected.path === f.path;
                                  return (
                                    <li key={f.path}>
                                      <button
                                        type="button"
                                        onClick={() => setSelected({ epicKey, path: f.path })}
                                        className={cn(
                                          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-ink-100",
                                          isSelected ? "bg-brand-soft font-medium text-brand hover:bg-brand-soft" : "text-ink-700",
                                        )}
                                        title={f.path}
                                      >
                                        <Icon className={cn("size-3.5 shrink-0", isSelected ? "text-brand" : "text-ink-400")} />
                                        <span className="truncate capitalize">{fileTitle(f.path)}</span>
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

            {/* Editor: the selected document - same pane, no separate card border. */}
            <div className="flex min-h-0 min-w-0 flex-col">
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
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-semibold text-ink-900">{fileState.data.path}</p>
                      <p className="text-[11px] text-ink-400">{selected.epicKey}</p>
                    </div>
                    <div className="flex shrink-0 items-center rounded-md border border-line p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setViewMode("source")}
                        className={cn("rounded px-2.5 py-1 font-medium transition-colors", viewMode === "source" ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50")}
                      >
                        Source
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("preview")}
                        className={cn("rounded px-2.5 py-1 font-medium transition-colors", viewMode === "preview" ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50")}
                        title="Ctrl+Shift+V"
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    {viewMode === "source" ? (
                      <CodeMirror value={fileState.data.content} editable={false} height="100%" extensions={[markdown()]} basicSetup={{ lineNumbers: true, foldGutter: false }} className="h-full" />
                    ) : (
                      <div className="h-full overflow-y-auto px-6 py-4">
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
