import { Alert } from "../../shared/ui/Alert.tsx";
import { DocumentsWorkspace } from "./DocumentsWorkspace.tsx";
import { QA_KINDS } from "./api.ts";

export function QaPage() {
  return (
    <DocumentsWorkspace
      title="QA"
      description="Each Epic's test plan and scenarios. QA edits them; developers and the VS Code agent read them while building."
      kinds={QA_KINDS}
      notice={
        <Alert tone="info" className="mb-4">
          Each Task's pull request, its CI status and test summary will show here once Tasks open pull requests from VS Code.
        </Alert>
      }
    />
  );
}
