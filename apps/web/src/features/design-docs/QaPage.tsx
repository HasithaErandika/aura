import { DocumentsWorkspace } from "./DocumentsWorkspace.tsx";
import { TaskPrsPanel } from "./TaskPrsPanel.tsx";
import { QA_KINDS } from "./api.ts";

export function QaPage() {
  return (
    <DocumentsWorkspace
      title="QA"
      description="Each Epic's test plan and scenarios, and each Task's pull request with its CI result. QA edits the plan and scenarios; developers and the VS Code agent read them while building."
      kinds={QA_KINDS}
      notice={<TaskPrsPanel />}
    />
  );
}
