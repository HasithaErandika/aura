import type { Role } from "../../lib/auth/roles.js";
import { sha256 } from "../../lib/hash.js";
import { conflict, notFound, validationFailed } from "../../lib/http/errors.js";
import { checkOpenApi } from "../../lib/openapi.js";
import { canEditDesignDoc } from "../policy/index.js";
import { designDocsRepository as repo } from "./design-docs.repository.js";
import type { AgentWriteInput, CreateDocInput, SaveVersionInput } from "./design-docs.schemas.js";
import { DOC_KINDS, defaultSlug, owningAgent, toDocView, toVersionView, type Author, type DocKind, type DocRow, type DocView, type VersionView } from "./design-docs.types.js";

export interface EpicSummary {
  epicKey: string;
  documents: number;
  updatedAt: string;
}

export function editableKinds(role: Role): DocKind[] {
  return DOC_KINDS.filter((k) => canEditDesignDoc(role, owningAgent(k)));
}

export async function listDocuments(filter: { epicKey?: string; kinds?: DocKind[] }): Promise<DocView[]> {
  const order = (kind: DocKind) => DOC_KINDS.indexOf(kind);
  return (await repo.list(filter)).map(toDocView).sort((a, b) => a.epicKey.localeCompare(b.epicKey) || order(a.kind) - order(b.kind) || a.slug.localeCompare(b.slug));
}

export async function listEpics(kinds?: DocKind[]): Promise<EpicSummary[]> {
  const byEpic = new Map<string, EpicSummary>();
  for (const d of await listDocuments({ kinds })) {
    const e = byEpic.get(d.epicKey) ?? { epicKey: d.epicKey, documents: 0, updatedAt: d.updatedAt };
    e.documents++;
    if (d.updatedAt > e.updatedAt) e.updatedAt = d.updatedAt;
    byEpic.set(d.epicKey, e);
  }
  return [...byEpic.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function requireDoc(id: string): Promise<DocRow> {
  const doc = await repo.findById(id);
  if (!doc) throw notFound("Document");
  return doc;
}

export async function getVersion(id: string, version?: number): Promise<{ document: DocView; version: VersionView; content: string }> {
  const doc = await requireDoc(id);
  const row = await repo.findVersion(id, version ?? doc.current_version);
  if (!row) throw notFound("Version");
  return { document: toDocView(doc), version: toVersionView(row), content: row.content };
}

export async function getDocument(id: string): Promise<{ document: DocView; content: string; versions: VersionView[] }> {
  const current = await getVersion(id);
  const versions = (await repo.listVersions(id)).map(toVersionView);
  return { document: current.document, content: current.content, versions };
}

// The API contract is checked on every save, by a person or an agent: a broken one is never stored.
function assertValidContent(kind: DocKind, content: string): void {
  if (kind !== "openapi") return;
  const { problems } = checkOpenApi(content);
  if (problems.length) throw validationFailed({ content: problems });
}

export async function createDocument(input: CreateDocInput, author: Author, extra: { draftId?: string } = {}): Promise<DocView> {
  assertValidContent(input.kind, input.content);
  const existing = (await repo.list({ epicKey: input.epicKey, kinds: [input.kind] })).map((d) => d.slug);
  const doc = await repo.insert({
    epic_key: input.epicKey,
    kind: input.kind,
    slug: input.slug ?? defaultSlug(input.kind, input.title, existing),
    title: input.title,
    issue_key: input.issueKey ?? null,
    current_version: 1,
    created_by: author.userId ?? null,
    created_by_agent: author.agent ?? null,
  });
  try {
    await repo.insertVersion(doc.id, 1, input.content, author, extra);
  } catch (error) {
    await repo.remove(doc.id);
    throw error;
  }
  return toDocView(doc);
}

export async function saveVersion(id: string, input: SaveVersionInput, author: Author, extra: { draftId?: string } = {}): Promise<{ document: DocView; changed: boolean }> {
  const current = await getVersion(id);
  const at = current.document.currentVersion;
  if (input.baseVersion !== at) throw conflict(`This document is at version ${at}; you edited version ${input.baseVersion}. Reload, then apply your change again.`);
  const titleChanged = input.title !== undefined && input.title !== current.document.title;
  if (sha256(input.content) === current.version.contentSha256 && !titleChanged) return { document: current.document, changed: false };
  assertValidContent(current.document.kind, input.content);
  await repo.insertVersion(id, at + 1, input.content, author, { note: input.note, draftId: extra.draftId });
  const doc = await repo.advance(id, at, { current_version: at + 1, ...(titleChanged ? { title: input.title } : {}) });
  return { document: toDocView(doc), changed: true };
}

export async function writeFromAgent(input: AgentWriteInput): Promise<{ document: DocView; changed: boolean; created: boolean }> {
  const author: Author = { agent: input.agent };
  const doc = await repo.findBySlug(input.epicKey, input.slug);
  if (!doc) {
    const create = { epicKey: input.epicKey, kind: input.kind, slug: input.slug, title: input.title, issueKey: input.issueKey, content: input.content };
    return { document: await createDocument(create, author, { draftId: input.draftId }), changed: true, created: true };
  }
  const note = input.draftId ? `From approved draft ${input.draftId}` : undefined;
  const saved = await saveVersion(doc.id, { content: input.content, baseVersion: doc.current_version, title: input.title, note }, author, { draftId: input.draftId });
  return { ...saved, created: false };
}
