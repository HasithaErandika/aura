import { errorMessage, logger } from "../../lib/logger.js";
import { writeAudit } from "../audit/index.js";
import { jira, jiraConfigured } from "../jira/index.js";
import { currentProjectId } from "../projects/index.js";
import { effectiveSettings } from "../settings/index.js";

// A Task's Jira status follows its work (docs/plans/aura-git-control-plane.md step 3.2).
export type TaskEvent = "started" | "in_review" | "merged" | "released";

const STATUS_SETTING: Record<TaskEvent, string> = {
  started: "jira.statusInProgress",
  in_review: "jira.statusInReview",
  merged: "jira.statusReadyForRelease",
  released: "jira.statusDone",
};

const LIFECYCLE: readonly TaskEvent[] = ["started", "in_review", "merged", "released"];
const SKIP = "none";

type Values = Record<string, { value: unknown } | undefined>;

// The status to move to and the lifecycle order, or null when this move is switched off.
export function statusPlan(settings: Values, event: TaskEvent): { target: string; order: string[] } | null {
  const name = (e: TaskEvent) => {
    const value = settings[STATUS_SETTING[e]]?.value;
    return typeof value === "string" && value.trim() && value.trim().toLowerCase() !== SKIP ? value.trim() : null;
  };
  const target = name(event);
  if (!target) return null;
  return { target, order: LIFECYCLE.map(name).filter((s): s is string => s !== null) };
}

// Best-effort: a Jira problem is logged and audited, never fails the PR, merge or release.
export async function moveTaskStatus(taskKey: string, event: TaskEvent, requestId?: string): Promise<void> {
  if (!jiraConfigured) return;
  try {
    const plan = statusPlan(await effectiveSettings(await currentProjectId(), null), event);
    if (!plan) return;
    const { from, outcome } = await jira.moveToStatus(taskKey, plan.target, plan.order);
    if (outcome === "unreachable") logger.warn("Jira status not reachable", { taskKey, from, to: plan.target });
    await writeAudit({ actorId: null, actorRole: null, action: "jira.status_moved", entityType: "jira_issue", entityId: taskKey, requestId, metadata: { event, from, to: plan.target, outcome } });
  } catch (error) {
    logger.warn("Jira status move failed", { taskKey, event, message: errorMessage(error) });
    await writeAudit({ actorId: null, actorRole: null, action: "jira.status_moved", entityType: "jira_issue", entityId: taskKey, requestId, metadata: { event, outcome: "failed", error: errorMessage(error).slice(0, 300) } });
  }
}

export async function moveEpicTasks(epicKey: string, event: TaskEvent, requestId?: string): Promise<string[]> {
  if (!jiraConfigured) return [];
  let keys: string[];
  try {
    keys = await jira.getEpicTaskKeys(epicKey);
  } catch (error) {
    logger.warn("Could not list the Epic's Tasks", { epicKey, message: errorMessage(error) });
    return [];
  }
  for (const key of keys) await moveTaskStatus(key, event, requestId);
  return keys;
}
