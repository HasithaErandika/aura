import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory stand-in for the Supabase query builder: enough of from().select/insert/
// update/delete with eq/in/order/limit/single/maybeSingle for this module, with the unique
// constraints the migration declares.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { design_documents: [], design_document_versions: [] };
const UNIQUE: Record<string, string[][]> = { design_documents: [["epic_key", "slug"]], design_document_versions: [["document_id", "version"]] };
let ids = 0;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let action: { kind: "select" } | { kind: "insert"; row: Row } | { kind: "update"; patch: Row } | { kind: "delete" } = { kind: "select" };
  const run = (): { data: Row[] | null; error: { code?: string; message: string } | null } => {
    const rows = tables[table]!;
    if (action.kind === "insert") {
      const row: Row = { id: `id-${++ids}`, created_at: new Date(Date.now() + ids).toISOString(), updated_at: new Date(Date.now() + ids).toISOString(), ...action.row };
      for (const cols of UNIQUE[table] ?? []) if (rows.some((r) => cols.every((c) => r[c] === row[c]))) return { data: null, error: { code: "23505", message: "duplicate" } };
      rows.push(row);
      return { data: [row], error: null };
    }
    const matched = rows.filter((r) => filters.every((f) => f(r)));
    if (action.kind === "update") for (const r of matched) Object.assign(r, (action as { patch: Row }).patch, { updated_at: new Date(Date.now() + ++ids).toISOString() });
    if (action.kind === "delete") tables[table] = rows.filter((r) => !matched.includes(r));
    return { data: matched, error: null };
  };
  const builder = {
    select: () => builder,
    insert: (row: Row) => ((action = { kind: "insert", row }), builder),
    update: (patch: Row) => ((action = { kind: "update", patch }), builder),
    delete: () => ((action = { kind: "delete" }), builder),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), builder),
    order: () => builder,
    limit: () => builder,
    single: async () => {
      const r = run();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    maybeSingle: async () => {
      const r = run();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => void) => resolve(run()),
  };
  return builder;
}

vi.mock("../../lib/supabase.js", () => ({ supabaseAdmin: { from: (t: string) => query(t) } }));

const { createDocument, getDocument, saveVersion, writeFromAgent, listEpics } = await import("./design-docs.service.js");
const { createDocSchema, defaultSlug, owningAgent } = await import("./design-docs.types.js");
const { canEditDesignDoc, canViewDesignDocs } = await import("../policy/policy.js");

beforeEach(() => {
  tables.design_documents = [];
  tables.design_document_versions = [];
});

describe("design document names and access", () => {
  it("names one plan per Epic, numbers ADRs and names scenarios", () => {
    expect(defaultSlug("architecture", "x", [])).toBe("architecture");
    expect(defaultSlug("adr", "Use Postgres for state", ["adr/0001-a", "adr/0007-b"])).toBe("adr/0008-use-postgres-for-state");
    expect(defaultSlug("qa-scenario", "Checkout with an expired card!", [])).toBe("qa/checkout-with-an-expired-card");
  });

  it("lets the Architect edit design docs and QA edit test docs; everyone in the pipeline reads", () => {
    expect(canEditDesignDoc("architect", owningAgent("adr"))).toBe(true);
    expect(canEditDesignDoc("architect", owningAgent("qa-plan"))).toBe(false);
    expect(canEditDesignDoc("qa_engineer", owningAgent("qa-scenario"))).toBe(true);
    expect(canEditDesignDoc("developer", owningAgent("architecture"))).toBe(false);
    expect(canEditDesignDoc("admin", owningAgent("architecture"))).toBe(false);
    for (const role of ["project_owner", "business_analyst", "developer", "qa_engineer", "admin"] as const) expect(canViewDesignDocs(role), role).toBe(true);
  });

  it("validates Epic keys and kinds", () => {
    expect(createDocSchema.safeParse({ epicKey: "KAN-36", kind: "adr", title: "x", content: "" }).success).toBe(true);
    expect(createDocSchema.safeParse({ epicKey: "kan 36", kind: "adr", title: "x", content: "" }).success).toBe(false);
    expect(createDocSchema.safeParse({ epicKey: "KAN-36", kind: "code", title: "x", content: "" }).success).toBe(false);
  });
});

describe("versions", () => {
  it("adds a version on top of the one the editor started from, and refuses a stale save", async () => {
    const doc = await createDocument({ epicKey: "KAN-36", kind: "architecture", title: "Architecture", content: "# v1" }, { userId: "u1" });
    expect(doc).toMatchObject({ slug: "architecture", currentVersion: 1 });
    const saved = await saveVersion(doc.id, { content: "# v2", baseVersion: 1, note: "API section" }, { userId: "u1" });
    expect(saved).toMatchObject({ changed: true, document: { currentVersion: 2 } });
    await expect(saveVersion(doc.id, { content: "# other", baseVersion: 1 }, { userId: "u2" })).rejects.toMatchObject({ status: 409 });
    const full = await getDocument(doc.id);
    expect(full.content).toBe("# v2");
    expect(full.versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });

  it("writes nothing when the content didn't change", async () => {
    const doc = await createDocument({ epicKey: "KAN-36", kind: "srs", title: "SRS", content: "same" }, { userId: "u1" });
    expect(await saveVersion(doc.id, { content: "same", baseVersion: 1 }, { userId: "u1" })).toMatchObject({ changed: false });
    expect(tables.design_document_versions).toHaveLength(1);
  });

  it("refuses a second document with the same name in an Epic", async () => {
    await createDocument({ epicKey: "KAN-36", kind: "plan", title: "Plan", content: "a" }, { userId: "u1" });
    await expect(createDocument({ epicKey: "KAN-36", kind: "plan", title: "Plan 2", content: "b" }, { userId: "u1" })).rejects.toMatchObject({ status: 409 });
  });

  it("creates then updates an agent's document by its name, keeping the draft as provenance", async () => {
    const first = await writeFromAgent({ epicKey: "KAN-36", kind: "adr", slug: "adr/0001-postgres", title: "Use Postgres", content: "A", agent: "architect-agent", draftId: "d1" });
    expect(first).toMatchObject({ created: true, changed: true });
    const again = await writeFromAgent({ epicKey: "KAN-36", kind: "adr", slug: "adr/0001-postgres", title: "Use Postgres", content: "A", agent: "architect-agent", draftId: "d1" });
    expect(again).toMatchObject({ created: false, changed: false });
    const updated = await writeFromAgent({ epicKey: "KAN-36", kind: "adr", slug: "adr/0001-postgres", title: "Use Postgres", content: "B", agent: "architect-agent", draftId: "d2" });
    expect(updated).toMatchObject({ changed: true, document: { currentVersion: 2 } });
    expect(tables.design_document_versions.map((v) => [v.author_agent, v.draft_id])).toEqual([
      ["architect-agent", "d1"],
      ["architect-agent", "d2"],
    ]);
    expect(await listEpics()).toMatchObject([{ epicKey: "KAN-36", documents: 1 }]);
  });
});

describe("import of pre-V3 workspace documents", async () => {
  const { planImport, IMPORT_AGENT } = await import("./import-plan.js");

  it("maps the Architect's and QA's files to kinds and slugs, and skips the rest", () => {
    const { writes, skipped } = planImport("KAN-36", [
      { path: "architecture/architecture.md", content: "# Architecture for KAN-36\n\nbody" },
      { path: "architecture/docs/srs/requirements-analysis.md", content: "# Requirements\n" },
      { path: "architecture/plan.md", content: "# Delivery plan\n" },
      { path: "architecture/docs/adr/0002-use-postgres.md", content: "# ADR-2. Use Postgres\n" },
      { path: "qa/test-plan.md", content: "# Test plan for KAN-36\n" },
      { path: "architecture/notes.md", content: "# Notes\n" },
      { path: "architecture/plan-empty.md", content: "" },
    ]);
    expect(writes.map((w) => [w.kind, w.slug, w.title])).toEqual([
      ["architecture", "architecture", "Architecture for KAN-36"],
      ["srs", "srs", "Requirements"],
      ["plan", "plan", "Delivery plan"],
      ["adr", "adr/0002-use-postgres", "ADR-2. Use Postgres"],
      ["qa-plan", "qa-plan", "Test plan for KAN-36"],
    ]);
    expect(writes.every((w) => w.agent === IMPORT_AGENT && w.epicKey === "KAN-36")).toBe(true);
    expect(skipped).toEqual(["architecture/notes.md", "architecture/plan-empty.md"]);
  });
});
