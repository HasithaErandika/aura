import { sha256 } from "../../lib/hash.js";
import { conflict, notFound, upstreamError } from "../../lib/http/errors.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { defaultSlug, type AgentWriteInput, type CreateDocInput, type DocKind, type DocView, type SaveVersionInput, type VersionView } from "./design-docs.types.js";

// Design documents and their versions (0010_design_documents.sql), through the service-role
// client. A new version is written only when the content changed, and only on top of the
// version the writer started from, so two editors never silently overwrite each other.

interface DocRow {
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

interface VersionRow {
  version: number;
  content: string;
  content_sha256: string;
  author_id: string | null;
  author_agent: string | null;
  note: string | null;
  draft_id: string | null;
  created_at: string;
}

const DOC_COLUMNS = "id, epic_key, kind, slug, title, issue_key, current_version, created_by, created_by_agent, created_at, updated_at";
const VERSION_META = "version, content_sha256, author_id, author_agent, note, draft_id, created_at";

export type Author = { userId: string; agent?: undefined } | { agent: string; userId?: undefined };

function toView(r: DocRow): DocView {
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

function toVersion(r: Omit<VersionRow, "content">): VersionView {
  return { version: r.version, contentSha256: r.content_sha256, authorId: r.author_id, authorAgent: r.author_agent, note: r.note, draftId: r.draft_id, createdAt: r.created_at };
}

const KIND_ORDER: DocKind[] = ["architecture", "srs", "plan", "adr", "qa-plan", "qa-scenario"];

export async function listDocuments(filter: { epicKey?: string; kinds?: DocKind[] }): Promise<DocView[]> {
  let query = supabaseAdmin.from("design_documents").select(DOC_COLUMNS);
  if (filter.epicKey) query = query.eq("epic_key", filter.epicKey);
  if (filter.kinds?.length) query = query.in("kind", filter.kinds);
  const { data, error } = await query.order("slug").limit(1000);
  if (error) throw upstreamError(error.message);
  return ((data ?? []) as DocRow[]).map(toView).sort((a, b) => a.epicKey.localeCompare(b.epicKey) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.slug.localeCompare(b.slug));
}

// Epics that have documents, with how many of each kind group.
export async function listEpics(kinds?: DocKind[]): Promise<{ epicKey: string; documents: number; updatedAt: string }[]> {
  const docs = await listDocuments({ kinds });
  const byEpic = new Map<string, { epicKey: string; documents: number; updatedAt: string }>();
  for (const d of docs) {
    const e = byEpic.get(d.epicKey) ?? { epicKey: d.epicKey, documents: 0, updatedAt: d.updatedAt };
    e.documents++;
    if (d.updatedAt > e.updatedAt) e.updatedAt = d.updatedAt;
    byEpic.set(d.epicKey, e);
  }
  return [...byEpic.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function findDoc(id: string): Promise<DocRow> {
  const { data, error } = await supabaseAdmin.from("design_documents").select(DOC_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw upstreamError(error.message);
  if (!data) throw notFound("Document");
  return data as DocRow;
}

export async function getVersion(id: string, version?: number): Promise<{ document: DocView; version: VersionView; content: string }> {
  const doc = await findDoc(id);
  const wanted = version ?? doc.current_version;
  const { data, error } = await supabaseAdmin.from("design_document_versions").select(`${VERSION_META}, content`).eq("document_id", id).eq("version", wanted).maybeSingle();
  if (error) throw upstreamError(error.message);
  if (!data) throw notFound("Version");
  const row = data as VersionRow;
  return { document: toView(doc), version: toVersion(row), content: row.content };
}

export async function getDocument(id: string): Promise<{ document: DocView; content: string; versions: VersionView[] }> {
  const current = await getVersion(id);
  const { data, error } = await supabaseAdmin.from("design_document_versions").select(VERSION_META).eq("document_id", id).order("version", { ascending: false }).limit(200);
  if (error) throw upstreamError(error.message);
  return { document: current.document, content: current.content, versions: ((data ?? []) as Omit<VersionRow, "content">[]).map(toVersion) };
}

async function insertVersion(docId: string, version: number, content: string, author: Author, extra: { note?: string; draftId?: string }): Promise<void> {
  const { error } = await supabaseAdmin.from("design_document_versions").insert({
    document_id: docId,
    version,
    content,
    content_sha256: sha256(content),
    author_id: author.userId ?? null,
    author_agent: author.agent ?? null,
    note: extra.note ?? null,
    draft_id: extra.draftId ?? null,
  });
  if (error) {
    if (error.code === "23505") throw conflict("Someone saved a newer version first. Reload, then apply your change again.");
    throw upstreamError(error.message);
  }
}

export async function createDocument(input: CreateDocInput, author: Author, extra: { draftId?: string } = {}): Promise<DocView> {
  const existing = (await listDocuments({ epicKey: input.epicKey })).filter((d) => d.kind === input.kind).map((d) => d.slug);
  const slug = input.slug ?? defaultSlug(input.kind, input.title, existing);
  const { data, error } = await supabaseAdmin
    .from("design_documents")
    .insert({ epic_key: input.epicKey, kind: input.kind, slug, title: input.title, issue_key: input.issueKey ?? null, current_version: 1, created_by: author.userId ?? null, created_by_agent: author.agent ?? null })
    .select(DOC_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw conflict(`${input.epicKey} already has a document named ${slug}`);
    throw upstreamError(error.message);
  }
  const doc = data as DocRow;
  try {
    await insertVersion(doc.id, 1, input.content, author, extra);
  } catch (e) {
    // No version means no document: remove the empty row (it has no history to keep).
    await supabaseAdmin.from("design_documents").delete().eq("id", doc.id);
    throw e;
  }
  return toView(doc);
}

// A new version on top of baseVersion. Unchanged content (and title) writes nothing.
export async function saveVersion(id: string, input: SaveVersionInput, author: Author, extra: { draftId?: string } = {}): Promise<{ document: DocView; changed: boolean }> {
  const current = await getVersion(id);
  if (input.baseVersion !== current.document.currentVersion) throw conflict(`This document is at version ${current.document.currentVersion}; you edited version ${input.baseVersion}. Reload, then apply your change again.`);
  const titleChanged = input.title !== undefined && input.title !== current.document.title;
  if (sha256(input.content) === current.version.contentSha256 && !titleChanged) return { document: current.document, changed: false };
  const next = current.document.currentVersion + 1;
  await insertVersion(id, next, input.content, author, { note: input.note, draftId: extra.draftId });
  const { data, error } = await supabaseAdmin
    .from("design_documents")
    .update({ current_version: next, ...(titleChanged ? { title: input.title } : {}) })
    .eq("id", id)
    .eq("current_version", input.baseVersion)
    .select(DOC_COLUMNS)
    .maybeSingle();
  if (error) throw upstreamError(error.message);
  if (!data) throw conflict("Someone saved a newer version first. Reload, then apply your change again.");
  return { document: toView(data as DocRow), changed: true };
}

// An agent's write after an approved gate: the document by (Epic, slug), created or updated.
export async function writeFromAgent(input: AgentWriteInput): Promise<{ document: DocView; changed: boolean; created: boolean }> {
  const { data, error } = await supabaseAdmin.from("design_documents").select(DOC_COLUMNS).eq("epic_key", input.epicKey).eq("slug", input.slug).maybeSingle();
  if (error) throw upstreamError(error.message);
  const author: Author = { agent: input.agent };
  if (!data) {
    const document = await createDocument({ epicKey: input.epicKey, kind: input.kind, slug: input.slug, title: input.title, issueKey: input.issueKey, content: input.content }, author, { draftId: input.draftId });
    return { document, changed: true, created: true };
  }
  const doc = data as DocRow;
  const saved = await saveVersion(doc.id, { content: input.content, baseVersion: doc.current_version, title: input.title, note: input.draftId ? `From approved draft ${input.draftId}` : undefined }, author, { draftId: input.draftId });
  return { ...saved, created: false };
}
