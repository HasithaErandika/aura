import { useEffect, useState } from "react";
import type { JiraIssueSummary } from "../../types/api.ts";
import { Card } from "../../shared/ui/Card.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Input, Select } from "../../shared/ui/Field.tsx";
import { ClipboardCheckIcon, CodeIcon, RunIcon, TicketIcon } from "../../shared/icons/index.tsx";
import { STATUS_TONE } from "../jira/format.ts";
import { scaffoldDisciplines, type ScaffoldDiscipline } from "./api.ts";
import type { ProjectFilesAccess } from "./access.ts";
import type { Location } from "./sources.ts";

// Where you are and what you can do there: Epic → discipline → Task, then this role's actions.
// Discipline and Task apply immediately; only the Epic needs "Open" (it is typed, not picked).

interface Props {
  location: Location | null;
  access: ProjectFilesAccess;
  epicSuggestions: string[];
  tasks: JiraIssueSummary[];
  tasksLoading: boolean;
  onOpenEpic: (epicKey: string) => void;
  onDiscipline: (discipline: ScaffoldDiscipline) => void;
  onTask: (taskKey: string | null) => void;
  onViewTask: (taskKey: string) => void;
  onRunCi: () => void;
  onRunTests: () => void;
  onCodeTask: () => void;
}

export function WorkspaceBar({ location, access, epicSuggestions, tasks, tasksLoading, onOpenEpic, onDiscipline, onTask, onViewTask, onRunCi, onRunTests, onCodeTask }: Props) {
  const [epicDraft, setEpicDraft] = useState(location?.epicKey ?? "");
  useEffect(() => setEpicDraft(location?.epicKey ?? ""), [location?.epicKey]);

  const open = () => epicDraft.trim() && onOpenEpic(epicDraft.trim());
  const showTaskPicker = access.see.code || access.see.qa;
  const task = tasks.find((t) => t.key === location?.taskKey);
  const ciDiscipline = location?.discipline === "Frontend" || location?.discipline === "Backend";

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-500">Epic</span>
          <div className="flex gap-1.5">
            <Input
              list="project-files-epics"
              value={epicDraft}
              onChange={(e) => setEpicDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && open()}
              placeholder="KAN-36"
              className="w-32 font-mono"
              aria-label="Epic key"
            />
            <datalist id="project-files-epics">
              {epicSuggestions.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
            <Button variant={location ? "secondary" : "primary"} onClick={open} disabled={!epicDraft.trim() || epicDraft.trim().toUpperCase() === location?.epicKey}>
              Open
            </Button>
          </div>
        </label>

        {location && access.see.code ? (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-500">Discipline</span>
            <Select value={location.discipline} onChange={(e) => onDiscipline(e.target.value as ScaffoldDiscipline)} className="w-36" aria-label="Discipline">
              {scaffoldDisciplines.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        {location && showTaskPicker ? (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-500">Task</span>
            <div className="flex items-center gap-1.5">
              <Select value={location.taskKey ?? ""} onChange={(e) => onTask(e.target.value || null)} className="w-72 max-w-full" aria-label="Task" disabled={tasksLoading && tasks.length === 0}>
                <option value="">{access.see.code ? "Base scaffold (no Task)" : "All Tasks"}</option>
                {tasks.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.key} · {t.summary}
                  </option>
                ))}
              </Select>
              {task ? (
                <>
                  <Badge tone={STATUS_TONE[task.statusCategory]}>{task.status}</Badge>
                  <Button size="sm" variant="ghost" icon={<TicketIcon className="size-3.5" />} onClick={() => onViewTask(task.key)} title="Open the Jira Task">
                    Details
                  </Button>
                </>
              ) : null}
            </div>
          </label>
        ) : null}

        {location ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {access.codeTask ? (
              <Button variant="primary" icon={<CodeIcon className="size-3.5" />} onClick={onCodeTask} disabled={!location.taskKey} title={location.taskKey ? "Start Gate 5 for this Task with the Coding Council" : "Pick a Task first"}>
                Code this Task
              </Button>
            ) : null}
            {access.runTests ? (
              <Button variant="primary" icon={<ClipboardCheckIcon className="size-3.5" />} onClick={onRunTests} disabled={!location.taskKey} title={location.taskKey ? "Run the Tester Agent loop (Gate 7) for this Task" : "Pick a Task first"}>
                Run tests
              </Button>
            ) : null}
            {access.runCi && ciDiscipline ? (
              <Button variant="secondary" icon={<RunIcon className="size-3.5" />} onClick={onRunCi} title="Run the project's checked-in CI locally - no approval gate, nothing pushed">
                Run CI
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
