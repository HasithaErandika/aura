import { supabaseAdmin } from "../../lib/supabase.js";

// Notes the developer types while a Task runs (migration 0011, plan §3). The runtime takes the
// pending ones between coder and Evaluator steps; taking them marks them delivered, once.

export interface RunNote {
  id: string;
  text: string;
  createdAt: string;
}

function dbError(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${error.message}${/run_notes/.test(error.message) ? " (apply supabase/migrations/0011_run_notes.sql)" : ""}`);
}

export const runNotes = {
  async add(runId: string, authorId: string, text: string): Promise<RunNote> {
    const { data, error } = await supabaseAdmin.from("run_notes").insert({ run_id: runId, author_id: authorId, text }).select("id, text, created_at").single();
    if (error) throw dbError("Could not save the note", error);
    const row = data as { id: string; text: string; created_at: string };
    return { id: row.id, text: row.text, createdAt: row.created_at };
  },

  // The run's undelivered notes, oldest first, marked delivered.
  async take(runId: string): Promise<RunNote[]> {
    const { data, error } = await supabaseAdmin.from("run_notes").select("id, text, created_at").eq("run_id", runId).is("delivered_at", null).order("created_at", { ascending: true });
    if (error) throw dbError("Could not read the notes", error);
    const rows = (data ?? []) as { id: string; text: string; created_at: string }[];
    if (rows.length) {
      const { error: markError } = await supabaseAdmin.from("run_notes").update({ delivered_at: new Date().toISOString() }).in("id", rows.map((r) => r.id)).is("delivered_at", null);
      if (markError) throw dbError("Could not mark the notes delivered", markError);
    }
    return rows.map((r) => ({ id: r.id, text: r.text, createdAt: r.created_at }));
  },
};
