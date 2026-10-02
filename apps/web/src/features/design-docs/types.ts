export type DocKind = "architecture" | "srs" | "plan" | "adr" | "qa-plan" | "qa-scenario";

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

export interface DocDetail {
  document: DesignDoc;
  content: string;
  versions: DocVersion[];
}

export type CiState = "pending" | "running" | "success" | "failure" | "cancelled";

export interface TaskPr {
  taskKey: string;
  epicKey: string | null;
  repo: string | null;
  branch: string;
  prNumber: number | null;
  prUrl: string | null;
  prTitle: string | null;
  prState: "open" | "merged" | "closed" | null;
  reviewers: string[];
  headSha: string | null;
  ciState: CiState | null;
  ciUrl: string | null;
  ciSummary: { jobs?: { name: string; result: string }[]; tests?: { passed: number; failed: number; skipped: number } };
  ciUpdatedAt: string | null;
  updatedAt: string;
}
