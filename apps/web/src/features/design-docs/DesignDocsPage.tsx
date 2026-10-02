import { DocumentsWorkspace } from "./components/DocumentsWorkspace.tsx";
import { ARCHITECT_KINDS } from "./lib/docs.ts";

export function DesignDocsPage() {
  return (
    <DocumentsWorkspace
      title="Design documents"
      description="Each Epic's architecture plan, requirements, delivery plan and ADRs. The Architect edits them; the pipeline and the VS Code agent read them."
      kinds={ARCHITECT_KINDS}
    />
  );
}
