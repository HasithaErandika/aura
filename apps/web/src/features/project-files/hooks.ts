import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { describeError } from "../../shared/api/errors.ts";
import { paths } from "../../app/paths.ts";
import { workspaceApi } from "../workspace/api.ts";
import { jiraApi } from "../jira/api.ts";
import { designDocsApi, qaFilesApi, scaffoldDisciplines, type ScaffoldDiscipline } from "./api.ts";
import { SOURCES, type Location } from "./sources.ts";
import type { ProjectFilesAccess, Source } from "./access.ts";

export interface Selection {
  source: Source;
  path: string;
}

// The workspace location lives in the URL (?epic=&discipline=&task=&open=source:path), so a
// reload, the back button, or a shared link lands on exactly the same Epic, Task and file.
export function useWorkspaceLocation() {
  const [params, setParams] = useSearchParams();
  const epicKey = params.get("epic")?.trim().toUpperCase() || null;
  const rawDiscipline = params.get("discipline");
  const discipline: ScaffoldDiscipline = (scaffoldDisciplines as readonly string[]).includes(rawDiscipline ?? "") ? (rawDiscipline as ScaffoldDiscipline) : "Frontend";
  const taskKey = params.get("task")?.trim().toUpperCase() || undefined;
  const open = params.get("open");

  const location = useMemo<Location | null>(() => (epicKey ? { epicKey, discipline, taskKey } : null), [epicKey, discipline, taskKey]);
  const selection = useMemo<Selection | null>(() => {
    const sep = open?.indexOf(":") ?? -1;
    if (!open || sep < 1) return null;
    const source = open.slice(0, sep);
    return source === "design" || source === "qa" || source === "code" ? { source, path: open.slice(sep + 1) } : null;
  }, [open]);

  const update = useCallback(
    (patch: { epicKey?: string; discipline?: ScaffoldDiscipline; taskKey?: string | null; open?: Selection | null }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const set = (key: string, value: string | null | undefined) => (value ? next.set(key, value) : next.delete(key));
          if (patch.epicKey !== undefined && patch.epicKey.toUpperCase() !== prev.get("epic")) {
            // A different Epic: nothing from the previous one carries over.
            set("epic", patch.epicKey.toUpperCase());
            next.delete("task");
            next.delete("open");
          }
          if (patch.discipline !== undefined) set("discipline", patch.discipline);
          if (patch.taskKey !== undefined) set("task", patch.taskKey?.toUpperCase());
          // Switching the code's worktree closes an open code file (it may not exist there).
          if ((patch.discipline !== undefined || patch.taskKey !== undefined) && prev.get("open")?.startsWith("code:")) next.delete("open");
          if (patch.open !== undefined) set("open", patch.open ? `${patch.open.source}:${patch.open.path}` : null);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { location, selection, update };
}

// File lists for every source this role may see, the Epic's Tasks (for the Task picker), and the
// Epics that have design/QA workspaces (for the Epic field's suggestions). Sources the role
// cannot see are never requested.
export function useProjectLists(location: Location | null, access: ProjectFilesAccess) {
  const epicKey = location?.epicKey;
  const design = useAsync(() => (location && access.see.design ? SOURCES.design.list(location) : Promise.resolve(null)), [epicKey, access.see.design]);
  const qa = useAsync(() => (location && access.see.qa ? SOURCES.qa.list(location) : Promise.resolve(null)), [epicKey, access.see.qa]);
  const code = useAsync(
    () => (location && access.see.code ? SOURCES.code.list(location) : Promise.resolve(null)),
    [epicKey, location?.discipline, location?.taskKey, access.see.code],
  );
  const tasks = useAsync(() => (epicKey && (access.see.code || access.see.qa) ? jiraApi.epic(epicKey).then((e) => e.tasks) : Promise.resolve(null)), [epicKey]);
  const epics = useAsync(async () => {
    const [d, q] = await Promise.all([
      access.see.design ? designDocsApi.listEpics().then((r) => r.epics).catch(() => []) : Promise.resolve([]),
      access.see.qa ? qaFilesApi.listEpics().then((r) => r.epics).catch(() => []) : Promise.resolve([]),
    ]);
    return [...new Set([...d, ...q])].sort();
  }, [access.see.design, access.see.qa]);

  return { lists: { design, qa, code }, tasks, epics };
}

// The file open in the editor: its content, and - for a role that may edit its source - the edit
// draft, save (Ctrl+S) and cancel (Esc).
export function useOpenFile(location: Location | null, selection: Selection | null, access: ProjectFilesAccess) {
  const file = useAsync(
    () => (location && selection && access.see[selection.source] ? SOURCES[selection.source].read(location, selection.path) : Promise.resolve(null)),
    [location?.epicKey, location?.discipline, location?.taskKey, selection?.source, selection?.path],
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const canEdit = selection ? access.edit[selection.source] : false;

  // A different file (or worktree) drops any unsaved edit rather than carrying it over.
  useEffect(() => {
    setEditing(false);
    setSaveError(null);
  }, [location?.epicKey, location?.discipline, location?.taskKey, selection?.source, selection?.path]);

  const startEdit = useCallback(() => {
    if (!file.data || !canEdit) return;
    setDraft(file.data.content);
    setSaveError(null);
    setEditing(true);
  }, [file.data, canEdit]);

  const cancel = useCallback(() => {
    setEditing(false);
    setSaveError(null);
  }, []);

  const save = useCallback(async () => {
    if (!location || !selection || !canEdit) return;
    setSaving(true);
    setSaveError(null);
    try {
      await SOURCES[selection.source].write(location, selection.path, draft);
      setEditing(false);
      await file.reload();
    } catch (err) {
      setSaveError(describeError(err));
    } finally {
      setSaving(false);
    }
  }, [location, selection, canEdit, draft, file]);

  useEffect(() => {
    if (!editing) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (e.key === "Escape") {
        cancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, save, cancel]);

  return { file, canEdit, editing, draft, setDraft, saving, saveError, startEdit, cancel, save };
}

// Starts an Orchestrator conversation pre-filled with a request and opens it in Agent Workspace -
// the one governed path for every agent action (Run tests, Code this Task, design feedback).
export function useStartConversation() {
  const navigate = useNavigate();
  return useCallback(
    async (initialMessage: string, existingThreadId?: string | null) => {
      const threadId = existingThreadId ?? (await workspaceApi.createThread("orchestrator")).id;
      navigate(paths.workspaceThread(threadId), { state: { initialMessage } });
    },
    [navigate],
  );
}
