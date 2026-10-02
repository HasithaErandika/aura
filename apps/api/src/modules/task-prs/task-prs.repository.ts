import { dbError } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { TaskPrRow } from "./task-prs.types.js";

const COLUMNS = "task_key, epic_key, repo_full_name, branch, pr_number, pr_url, pr_title, pr_state, reviewers, head_sha, merged_at, merge_sha, ci_state, ci_url, ci_summary, ci_updated_at, opened_by, run_id, updated_at";
const LIST_LIMIT = 200;

export const taskPrsRepository = {
  async findByTask(taskKey: string): Promise<TaskPrRow | null> {
    const { data, error } = await supabaseAdmin.from("task_branches").select(COLUMNS).eq("task_key", taskKey).maybeSingle();
    if (error) throw dbError("Could not read the Task's pull request", error);
    return (data as TaskPrRow | null) ?? null;
  },

  async findByRepoBranch(repo: string, branch: string): Promise<TaskPrRow | null> {
    const { data, error } = await supabaseAdmin.from("task_branches").select(COLUMNS).eq("repo_full_name", repo).eq("branch", branch).maybeSingle();
    if (error) throw dbError("Could not read the Task's pull request", error);
    return (data as TaskPrRow | null) ?? null;
  },

  async list(filter: { epicKey?: string; taskKey?: string }): Promise<TaskPrRow[]> {
    let query = supabaseAdmin.from("task_branches").select(COLUMNS);
    if (filter.epicKey) query = query.eq("epic_key", filter.epicKey);
    if (filter.taskKey) query = query.eq("task_key", filter.taskKey);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(LIST_LIMIT);
    if (error) throw dbError("Could not read pull requests", error);
    return (data ?? []) as TaskPrRow[];
  },

  async upsert(row: Record<string, unknown>): Promise<TaskPrRow> {
    const { data, error } = await supabaseAdmin.from("task_branches").upsert(row, { onConflict: "task_key" }).select(COLUMNS).single();
    if (error) throw dbError("Could not record the pull request", error);
    return data as TaskPrRow;
  },

  async insert(row: Record<string, unknown>): Promise<void> {
    const { error } = await supabaseAdmin.from("task_branches").insert(row);
    if (error) throw dbError("Could not record the Task branch", error);
  },

  async update(taskKey: string, patch: Record<string, unknown>): Promise<TaskPrRow> {
    const { data, error } = await supabaseAdmin.from("task_branches").update(patch).eq("task_key", taskKey).select(COLUMNS).single();
    if (error) throw dbError("Could not update the Task's pull request", error);
    return data as TaskPrRow;
  },
};
