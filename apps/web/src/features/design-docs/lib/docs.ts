import { agentLabel } from "@/shared/lib/agents.ts";
import type { DesignDoc, DocKind, DocVersion } from "../types.ts";

export const ARCHITECT_KINDS: DocKind[] = ["architecture", "srs", "plan", "openapi", "adr"];
export const QA_KINDS: DocKind[] = ["qa-plan", "qa-scenario"];
export const ADDABLE_KINDS: DocKind[] = ["adr", "qa-scenario"];

export const KIND_LABELS: Record<DocKind, string> = {
  architecture: "Architecture plan",
  srs: "Requirements (SRS)",
  plan: "Delivery plan",
  adr: "ADRs",
  openapi: "API contract",
  "qa-plan": "Test plan",
  "qa-scenario": "Test scenarios",
};

// The API contract is OpenAPI YAML, not Markdown: shown as a code block.
export function previewSource(kind: DocKind, content: string): string {
  return kind === "openapi" ? `\`\`\`yaml\n${content.replace(/\n+$/, "")}\n\`\`\`` : content;
}

export function groupByKind(documents: DesignDoc[], kinds: DocKind[]): Array<{ kind: DocKind; documents: DesignDoc[] }> {
  return kinds
    .map((kind) => ({ kind, documents: documents.filter((d) => d.kind === kind).sort((a, b) => a.slug.localeCompare(b.slug)) }))
    .filter((group) => group.documents.length > 0);
}

export function firstDocument(documents: DesignDoc[], kinds: DocKind[]): DesignDoc | null {
  return groupByKind(documents, kinds)[0]?.documents[0] ?? null;
}

export function versionAuthor(version: Pick<DocVersion, "authorAgent" | "authorId">, names: Record<string, string> = {}): string {
  if (version.authorAgent) return agentLabel(version.authorAgent);
  if (version.authorId) return names[version.authorId] ?? "A team member";
  return "Unknown";
}

export function normalizeKey(value: string | null | undefined): string | null {
  const key = value?.trim().toUpperCase();
  return key ? key : null;
}
