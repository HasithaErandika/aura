export const DOC_KINDS = ["architecture", "srs", "plan", "adr", "qa-plan", "qa-scenario"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

const QA_KINDS: readonly DocKind[] = ["qa-plan", "qa-scenario"];
const SINGLETON_KINDS: readonly DocKind[] = ["architecture", "srs", "plan", "qa-plan"];

export function owningAgent(kind: DocKind): "architect-agent" | "qa-agent" {
  return QA_KINDS.includes(kind) ? "qa-agent" : "architect-agent";
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

export function defaultSlug(kind: DocKind, title: string, existing: string[]): string {
  if (SINGLETON_KINDS.includes(kind)) return kind;
  if (kind === "adr") {
    const numbers = existing.map((s) => /^adr\/(\d{4})-/.exec(s)?.[1]).filter(Boolean).map(Number);
    const next = String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, "0");
    return `adr/${next}-${slugify(title)}`;
  }
  return `qa/${slugify(title)}`;
}

export interface DocRow {
  id: string;
  epic_key: string;
  kind: DocKind;
  slug: string;
  title: string;
  issue_key: string | null;
  current_version: number;
  created_by: string | null;
  created_by_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface VersionRow {
  version: number;
  content: string;
  content_sha256: string;
  author_id: string | null;
  author_agent: string | null;
  note: string | null;
  draft_id: string | null;
  created_at: string;
}

export type VersionMetaRow = Omit<VersionRow, "content">;

export interface DocView {
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

export interface VersionView {
  version: number;
  contentSha256: string;
  authorId: string | null;
  authorAgent: string | null;
  note: string | null;
  draftId: string | null;
  createdAt: string;
}

export type Author = { userId: string; agent?: undefined } | { agent: string; userId?: undefined };

export function toDocView(r: DocRow): DocView {
  return {
    id: r.id,
    epicKey: r.epic_key,
    kind: r.kind,
    slug: r.slug,
    title: r.title,
    issueKey: r.issue_key,
    currentVersion: r.current_version,
    createdBy: r.created_by,
    createdByAgent: r.created_by_agent,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toVersionView(r: VersionMetaRow): VersionView {
  return { version: r.version, contentSha256: r.content_sha256, authorId: r.author_id, authorAgent: r.author_agent, note: r.note, draftId: r.draft_id, createdAt: r.created_at };
}
