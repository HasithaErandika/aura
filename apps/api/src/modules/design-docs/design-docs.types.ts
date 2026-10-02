import { z } from "zod";

// Design documents (supabase/migrations/0010_design_documents.sql): the Architect's and QA's
// Markdown per Epic, versioned. Pure: kinds, names and request shapes, tested directly.

export const DOC_KINDS = ["architecture", "srs", "plan", "adr", "qa-plan", "qa-scenario"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const ARCHITECT_KINDS: readonly DocKind[] = ["architecture", "srs", "plan", "adr"];
export const QA_KINDS: readonly DocKind[] = ["qa-plan", "qa-scenario"];

// The agent whose run grant makes a role the owner (editor) of a kind (policy.ts canEditDesignDoc).
export function owningAgent(kind: DocKind): "architect-agent" | "qa-agent" {
  return QA_KINDS.includes(kind) ? "qa-agent" : "architect-agent";
}

export const KIND_LABELS: Record<DocKind, string> = {
  architecture: "Architecture plan",
  srs: "Requirements (SRS)",
  plan: "Delivery plan",
  adr: "ADR",
  "qa-plan": "Test plan",
  "qa-scenario": "Test scenario",
};

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

// Where a new document of a kind lives, unless the caller names it: one architecture plan, SRS
// and delivery plan per Epic; ADRs and scenarios numbered or named.
export function defaultSlug(kind: DocKind, title: string, existing: string[]): string {
  if (kind === "architecture" || kind === "srs" || kind === "plan" || kind === "qa-plan") return kind;
  if (kind === "adr") {
    const numbers = existing.map((s) => /^adr\/(\d{4})-/.exec(s)?.[1]).filter(Boolean).map(Number);
    const next = String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, "0");
    return `adr/${next}-${slugify(title)}`;
  }
  return `qa/${slugify(title)}`;
}

export const epicKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]*-[0-9]+$/, "an Epic key like KAN-36");
const issueKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]*-[0-9]+$/, "an issue key like KAN-45");
const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9/_.-]{0,199}$/, "lowercase letters, digits, / _ . -");
const contentSchema = z.string().max(500_000);

export const createDocSchema = z
  .object({
    epicKey: epicKeySchema,
    kind: z.enum(DOC_KINDS),
    title: z.string().trim().min(1).max(300),
    slug: slugSchema.optional(),
    issueKey: issueKeySchema.nullish(),
    content: contentSchema,
  })
  .strict();
export type CreateDocInput = z.infer<typeof createDocSchema>;

export const saveVersionSchema = z
  .object({
    content: contentSchema,
    // The version the editor started from; saving over a newer one is refused (409).
    baseVersion: z.number().int().min(1),
    note: z.string().trim().max(500).optional(),
    title: z.string().trim().min(1).max(300).optional(),
  })
  .strict();
export type SaveVersionInput = z.infer<typeof saveVersionSchema>;

export const listQuerySchema = z
  .object({
    epicKey: epicKeySchema.optional(),
    kind: z
      .string()
      .optional()
      .transform((raw) => (raw ? raw.split(",").filter((k): k is DocKind => (DOC_KINDS as readonly string[]).includes(k)) : undefined)),
  })
  .strict();

// The runtime's write after an approved gate: create the document or add a version.
export const agentWriteSchema = z
  .object({
    epicKey: epicKeySchema,
    kind: z.enum(DOC_KINDS),
    slug: slugSchema,
    title: z.string().trim().min(1).max(300),
    issueKey: issueKeySchema.nullish(),
    content: contentSchema,
    agent: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
    draftId: z.string().min(1).max(128).optional(),
  })
  .strict();
export type AgentWriteInput = z.infer<typeof agentWriteSchema>;

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
