import { dbError } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { RunNote } from "./runs.types.js";

interface NoteRow {
  id: string;
  text: string;
  created_at: string;
}

const toNote = (row: NoteRow): RunNote => ({ id: row.id, text: row.text, createdAt: row.created_at });

export const runNotesRepository = {
  async add(runId: string, authorId: string, text: string): Promise<RunNote> {
    const { data, error } = await supabaseAdmin.from("run_notes").insert({ run_id: runId, author_id: authorId, text }).select("id, text, created_at").single();
    if (error) throw dbError("Could not save the note", error);
    return toNote(data as NoteRow);
  },

  // Undelivered notes, oldest first; taking them marks them delivered.
  async take(runId: string): Promise<RunNote[]> {
    const { data, error } = await supabaseAdmin.from("run_notes").select("id, text, created_at").eq("run_id", runId).is("delivered_at", null).order("created_at", { ascending: true });
    if (error) throw dbError("Could not read the notes", error);
    const rows = (data ?? []) as NoteRow[];
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      const { error: markError } = await supabaseAdmin.from("run_notes").update({ delivered_at: new Date().toISOString() }).in("id", ids).is("delivered_at", null);
      if (markError) throw dbError("Could not mark the notes delivered", markError);
    }
    return rows.map(toNote);
  },
};
