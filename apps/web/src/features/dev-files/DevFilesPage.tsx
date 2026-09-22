import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { useAuth } from "../../shared/auth/useAuth.ts";
import { describeError } from "../../shared/api/errors.ts";
import { devFilesApi, scaffoldDisciplines, type ScaffoldDiscipline } from "./api.ts";
import { languageExtension } from "./language.ts";
import { FileTree } from "../../shared/ui/FileTree.tsx";
import { DockerRunsPanel } from "../runs/components/DockerRunsPanel.tsx";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Input, Select, Field } from "../../shared/ui/Field.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { DocumentIcon, TreeIcon } from "../../shared/icons/index.tsx";
import { vscode } from "../../shared/lib/vscodeTheme.ts";

// Viewer, and (for the Developer role) editor, for a Task's scaffolded directory (Gate 4/5
// output). Requires the human to already know the Epic + discipline (no "list all scaffolded
// Epics" endpoint exists, unlike the Architect workspace) since a Task's directory is keyed by
// both. Renders a VS Code-style Explorer tree (FileTree.tsx) and highlights code with the same
// theme/language set VS Code's own default dark theme uses (@uiw/codemirror-theme-vscode +
// per-extension @codemirror/lang-*), rather than a flat file list with unhighlighted text.

export function DevFilesPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "developer";

  const [epicKey, setEpicKey] = useState("");
  const [discipline, setDiscipline] = useState<ScaffoldDiscipline>("Frontend");
  const [loaded, setLoaded] = useState<{ epicKey: string; discipline: ScaffoldDiscipline } | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filesState = useAsync(
    () => (loaded ? devFilesApi.list(loaded.epicKey, loaded.discipline) : Promise.resolve(null)),
    [loaded?.epicKey, loaded?.discipline],
  );
  const fileState = useAsync(
    () => (loaded && selectedPath ? devFilesApi.read(loaded.epicKey, loaded.discipline, selectedPath) : Promise.resolve(null)),
    [loaded?.epicKey, loaded?.discipline, selectedPath],
  );

  // Switching files drops any in-progress edit rather than carrying it to a different file.
  useEffect(() => {
    setEditing(false);
    setSaveError(null);
  }, [loaded?.epicKey, loaded?.discipline, selectedPath]);

  function startEditing() {
    if (!fileState.data) return;
    setDraft(fileState.data.content);
    setSaveError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!loaded || !selectedPath) return;
    setSaving(true);
    setSaveError(null);
    try {
      await devFilesApi.write(loaded.epicKey, loaded.discipline, selectedPath, draft);
      setEditing(false);
      await fileState.reload();
    } catch (err) {
      setSaveError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  function load() {
    const trimmed = epicKey.trim().toUpperCase();
    if (!trimmed) return;
    setSelectedPath(null);
    setLoaded({ epicKey: trimmed, discipline });
  }

  const files = filesState.data?.files ?? [];

  return (
    <>
      <PageHeader
        title="Scaffolded Project Files"
        description={
          canEdit
            ? "A Task's scaffolded directory (Gate 4 output, as edited by Gate 5's coding agent) - you can hand-edit a file directly."
            : "Read-only view of a Task's scaffolded directory (Gate 4 output, as edited by Gate 5's coding agent)."
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Epic key" htmlFor="dev-files-epic">
            <Input id="dev-files-epic" value={epicKey} onChange={(e) => setEpicKey(e.target.value)} placeholder="KAN-3" className="w-32" onKeyDown={(e) => e.key === "Enter" && load()} />
          </Field>
          <Field label="Discipline" htmlFor="dev-files-discipline">
            <Select id="dev-files-discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value as ScaffoldDiscipline)} className="w-40">
              {scaffoldDisciplines.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" onClick={load} disabled={!epicKey.trim()}>
            Load
          </Button>
        </div>
      </Card>

      {!loaded ? (
        <Card>
          <EmptyState icon={<TreeIcon className="size-5" />} title="Enter an Epic and discipline" description="Load a Task's scaffolded directory to browse its files." />
        </Card>
      ) : (
        <>
          {/* Which Gate 4/5/7 containers touched this Epic, right where its files are being
              browsed - the "place to see running Docker components" this page was missing. */}
          <DockerRunsPanel epicKey={loaded.epicKey} title="Docker runs for this Epic" description="Scaffold, coding, and test containers labeled with this Epic." />

          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]" style={{ height: "70vh" }}>
              {/* Explorer pane - VS Code's own Explorer shape: a nested folder/file tree, not a
                  flat list of full paths. */}
              <div className="flex min-h-0 flex-col" style={{ backgroundColor: vscode.sidebarBg, borderRight: `1px solid ${vscode.border}` }}>
                <div className="shrink-0 px-3 py-2.5" style={{ borderBottom: `1px solid ${vscode.border}` }}>
                  <p className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: vscode.mutedText }}>
                    Explorer
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs font-semibold" style={{ color: vscode.text }}>
                    {loaded.epicKey} / {loaded.discipline.toLowerCase()}
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                  {filesState.error ? (
                    <p className="px-2 py-1.5 text-xs text-danger">{filesState.error}</p>
                  ) : filesState.loading && !filesState.data ? (
                    <div className="space-y-1.5 p-2">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3.5 w-28" />
                    </div>
                  ) : (
                    <FileTree
                      key={`${loaded.epicKey}-${loaded.discipline}`}
                      files={files}
                      selectedPath={selectedPath}
                      onSelect={setSelectedPath}
                      emptyMessage="No files found - has this Task been scaffolded yet?"
                    />
                  )}
                </div>
              </div>

              {/* Editor pane - VS Code dark theme + real syntax highlighting by file extension. */}
              <div className="flex min-h-0 min-w-0 flex-col" style={{ backgroundColor: vscode.editorBg }}>
                {!selectedPath ? (
                  <EmptyState icon={<DocumentIcon className="size-5" />} title="Select a file" description="Pick a file from the tree to view its contents." className="h-full py-16" />
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
                      <p className="truncate font-mono text-sm font-semibold" style={{ color: vscode.text }}>{fileState.data.path}</p>
                      {canEdit ? (
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
                    {editing ? (
                      <div className="shrink-0 border-b border-line bg-warning-soft px-4 py-2 text-xs text-warning">
                        Manual edits aren't versioned - if the Coding Agent (Gate 5) runs against this Task again, this file is overwritten from that run.
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
                        extensions={languageExtension(selectedPath)}
                        basicSetup={{ lineNumbers: true, foldGutter: true }}
                        className="h-full text-sm"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
