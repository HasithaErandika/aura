import { dbError, isUniqueViolation } from "../../lib/db.js";
import { sha256 } from "../../lib/hash.js";
import { conflict } from "../../lib/http/errors.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { Author, DocKind, DocRow, VersionMetaRow, VersionRow } from "./design-docs.types.js";

const DOC_COLUMNS = "id, epic_key, kind, slug, title, issue_key, current_version, created_by, created_by_agent, created_at, updated_at";
const VERSION_META = "version, content_sha256, author_id, author_agent, note, draft_id, created_at";
const STALE_VERSION = "Someone saved a newer version first. Reload, then apply your change again.";

export const designDocsRepository = {
  async list(filter: { epicKey?: string; kinds?: DocKind[] }): Promise<DocRow[]> {
    let query = supabaseAdmin.from("design_documents").select(DOC_COLUMNS);
    if (filter.epicKey) query = query.eq("epic_key", filter.epicKey);
    if (filter.kinds?.length) query = query.in("kind", filter.kinds);
    const { data, error } = await query.order("slug").limit(1000);
    if (error) throw dbError("list design documents", error);
    return (data ?? []) as DocRow[];
  },

  async findById(id: string): Promise<DocRow | null> {
    const { data, error } = await supabaseAdmin.from("design_documents").select(DOC_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw dbError("find design document", error);
    return (data as DocRow | null) ?? null;
  },

  async findBySlug(epicKey: string, slug: string): Promise<DocRow | null> {
    const { data, error } = await supabaseAdmin.from("design_documents").select(DOC_COLUMNS).eq("epic_key", epicKey).eq("slug", slug).maybeSingle();
    if (error) throw dbError("find design document", error);
    return (data as DocRow | null) ?? null;
  },

  async insert(row: Omit<DocRow, "id" | "created_at" | "updated_at">): Promise<DocRow> {
    const { data, error } = await supabaseAdmin.from("design_documents").insert(row).select(DOC_COLUMNS).single();
    if (isUniqueViolation(error)) throw conflict(`${row.epic_key} already has a document named ${row.slug}`);
    if (error) throw dbError("create design document", error);
    return data as DocRow;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from("design_documents").delete().eq("id", id);
    if (error) throw dbError("remove design document", error);
  },

  async advance(id: string, from: number, patch: { current_version: number; title?: string }): Promise<DocRow> {
    const { data, error } = await supabaseAdmin.from("design_documents").update(patch).eq("id", id).eq("current_version", from).select(DOC_COLUMNS).maybeSingle();
    if (error) throw dbError("update design document", error);
    if (!data) throw conflict(STALE_VERSION);
    return data as DocRow;
  },

  async findVersion(documentId: string, version: number): Promise<VersionRow | null> {
    const { data, error } = await supabaseAdmin.from("design_document_versions").select(`${VERSION_META}, content`).eq("document_id", documentId).eq("version", version).maybeSingle();
    if (error) throw dbError("find design document version", error);
    return (data as VersionRow | null) ?? null;
  },

  async listVersions(documentId: string): Promise<VersionMetaRow[]> {
    const { data, error } = await supabaseAdmin.from("design_document_versions").select(VERSION_META).eq("document_id", documentId).order("version", { ascending: false }).limit(200);
    if (error) throw dbError("list design document versions", error);
    return (data ?? []) as VersionMetaRow[];
  },

  async insertVersion(documentId: string, version: number, content: string, author: Author, extra: { note?: string; draftId?: string }): Promise<void> {
    const { error } = await supabaseAdmin.from("design_document_versions").insert({
      document_id: documentId,
      version,
      content,
      content_sha256: sha256(content),
      author_id: author.userId ?? null,
      author_agent: author.agent ?? null,
      note: extra.note ?? null,
      draft_id: extra.draftId ?? null,
    });
    if (isUniqueViolation(error)) throw conflict(STALE_VERSION);
    if (error) throw dbError("save design document version", error);
  },
};
