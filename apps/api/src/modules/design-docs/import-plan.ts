import type { AgentWriteInput, DocKind } from "./design-docs.types.js";

// Maps the Markdown an Epic's workspace holds from before V3 (.workspaces/<EPIC>/architecture and
// qa) onto design documents, for scripts/import-design-docs.ts. Pure, so it is tested directly.

export interface WorkspaceFile {
  // Relative to the Epic's folder, with forward slashes, e.g. "architecture/docs/adr/0001-x.md".
  path: string;
  content: string;
}

export const IMPORT_AGENT = "workspace-import";

function placement(path: string): { kind: DocKind; slug: string } | null {
  if (path === "architecture/architecture.md") return { kind: "architecture", slug: "architecture" };
  if (path === "architecture/plan.md") return { kind: "plan", slug: "plan" };
  if (path === "architecture/docs/srs/requirements-analysis.md") return { kind: "srs", slug: "srs" };
  if (path === "qa/test-plan.md") return { kind: "qa-plan", slug: "qa-plan" };
  const adr = /^architecture\/docs\/adr\/(\d{4}-[a-z0-9-]+)\.md$/.exec(path);
  if (adr) return { kind: "adr", slug: `adr/${adr[1]}` };
  return null;
}

function titleOf(content: string, fallback: string): string {
  const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
  return (heading || fallback).slice(0, 300);
}

export function planImport(epicKey: string, files: WorkspaceFile[]): { writes: AgentWriteInput[]; skipped: string[] } {
  const writes: AgentWriteInput[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const place = placement(file.path);
    if (!place || !file.content.trim()) {
      skipped.push(file.path);
      continue;
    }
    writes.push({ epicKey, kind: place.kind, slug: place.slug, title: titleOf(file.content, place.slug), content: file.content, agent: IMPORT_AGENT });
  }
  return { writes, skipped };
}
