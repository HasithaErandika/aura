import { DocumentsWorkspace } from "./DocumentsWorkspace.tsx";
import { ARCHITECT_KINDS } from "./api.ts";

export function DesignDocsPage() {
  return (
    <DocumentsWorkspace
      title="Design documents"
      description="Each Epic's architecture plan, requirements (SRS), delivery plan and ADRs. The Architect edits them; everyone on the pipeline reads them, and so does the VS Code agent."
      kinds={ARCHITECT_KINDS}
    />
  );
}
