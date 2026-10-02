// Design documents (apps/api modules/design-docs): the Architect's and QA's Markdown per Epic,
// versioned in Postgres. Types and pure helpers, kept apart from the API client so they test
// without the app's environment.

export const DOC_KINDS = ["architecture", "srs", "plan", "adr", "qa-plan", "qa-scenario"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export const ARCHITECT_KINDS: DocKind[] = ["architecture", "srs", "plan", "adr"];
export const QA_KINDS: DocKind[] = ["qa-plan", "qa-scenario"];

export const KIND_LABELS: Record<DocKind, string> = {
  architecture: "Architecture plan",
  srs: "Requirements (SRS)",
  plan: "Delivery plan",
  adr: "ADRs",
  "qa-plan": "Test plan",
  "qa-scenario": "Test scenarios",
};

export interface DesignDoc {
  id: string;
  epicKey: string;
  kind: DocKind;
  slug: string;
  title: string;
  issueKey: string | null;
  currentVersion: number;
  createdBy: string | null;
  createdByAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocVersion {
  version: number;
  contentSha256: string;
  authorId: string | null;
  authorAgent: string | null;
  note: string | null;
  draftId: string | null;
  createdAt: string;
}

export interface DocEpic {
  epicKey: string;
  documents: number;
  updatedAt: string;
}

// Groups documents under their kind, in the order the page lists kinds; ADRs and scenarios by slug.
export function groupByKind(documents: DesignDoc[], kinds: DocKind[]): Array<{ kind: DocKind; documents: DesignDoc[] }> {
  return kinds
    .map((kind) => ({ kind, documents: documents.filter((d) => d.kind === kind).sort((a, b) => a.slug.localeCompare(b.slug)) }))
    .filter((group) => group.documents.length > 0);
}

const AGENT_NAMES: Record<string, string> = { "architect-agent": "Architect Agent", "qa-agent": "QA Agent" };

// Who wrote a version, for the history list.
export function versionAuthor(version: DocVersion, names: Record<string, string> = {}): string {
  if (version.authorAgent) return AGENT_NAMES[version.authorAgent] ?? version.authorAgent;
  if (version.authorId) return names[version.authorId] ?? "A team member";
  return "Unknown";
}
