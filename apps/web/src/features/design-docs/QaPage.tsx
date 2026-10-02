import { useProfile } from "@/shared/auth/useAuth.ts";
import { canViewTaskPrs } from "@/shared/lib/access.ts";
import { DocumentsWorkspace } from "./components/DocumentsWorkspace.tsx";
import { TaskPrsPanel } from "./components/TaskPrsPanel.tsx";
import { QA_KINDS } from "./lib/docs.ts";

export function QaPage() {
  const me = useProfile();
  return (
    <DocumentsWorkspace
      title="QA"
      description="Each Epic's test plan and scenarios, and each Task's pull request with its CI result. QA edits the plan; developers read it while building."
      kinds={QA_KINDS}
      notice={canViewTaskPrs(me) ? <TaskPrsPanel /> : null}
    />
  );
}
