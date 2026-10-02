// A Jira event that offers a Task's work to its assignee (roadmap step 3.8): the Task moved into
// the configured status, or the configured label was added. Only the change in this event counts,
// so editing a Task that already carries the label offers nothing again.

export interface ReadyTask {
  taskKey: string;
  epicKey: string | null;
  summary: string;
  assigneeEmail: string | null;
  reason: "status" | "label";
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const KEY = /^[A-Z][A-Z0-9_]*-\d+$/;
const WORK_TYPES = ["task", "bug", "sub-task", "subtask"];

export function readyTask(payload: Json, triggers: { status: string | null; label: string | null }): ReadyTask | null {
  const issue = obj(payload.issue);
  const fields = obj(issue.fields);
  const taskKey = str(issue.key);
  if (!KEY.test(taskKey) || !WORK_TYPES.includes(str(obj(fields.issuetype).name).toLowerCase())) return null;
  const items = Array.isArray(obj(payload.changelog).items) ? (obj(payload.changelog).items as unknown[]).map(obj) : [];
  let reason: ReadyTask["reason"] | null = null;
  if (triggers.status && items.some((i) => str(i.field) === "status" && same(str(i.toString), triggers.status!) && !same(str(i.fromString), triggers.status!))) reason = "status";
  const words = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => w.toLowerCase());
  if (!reason && triggers.label && items.some((i) => str(i.field) === "labels" && words(str(i.toString)).includes(triggers.label!.toLowerCase()) && !words(str(i.fromString)).includes(triggers.label!.toLowerCase()))) reason = "label";
  if (!reason) return null;
  const parent = str(obj(fields.parent).key);
  const email = str(obj(fields.assignee).emailAddress);
  return { taskKey, epicKey: KEY.test(parent) ? parent : null, summary: str(fields.summary).slice(0, 200), assigneeEmail: email || null, reason };
}
