import { writeAudit } from "../audit/index.js";
import { developerIdByEmail, userIdsWithRole } from "../identity/index.js";
import { notify } from "../notifications/index.js";
import { currentProjectId } from "../projects/index.js";
import { effectiveSettings } from "../settings/index.js";
import { readyTask } from "./jira-event.js";
import { getTaskPr } from "./task-prs.service.js";

const trigger = (settings: Record<string, { value: unknown } | undefined>, key: string): string | null => {
  const value = settings[key]?.value;
  return typeof value === "string" && value.trim() && value.trim().toLowerCase() !== "none" ? value.trim() : null;
};

// Jira's issue_updated webhook (step 3.8): a Task that became ready is offered to its assignee,
// whose VS Code asks to Start Work. Nothing runs or is approved without the developer.
export async function offerReadyTask(payload: Record<string, unknown>): Promise<"handled" | "ignored"> {
  const settings = await effectiveSettings(await currentProjectId(), null);
  const ready = readyTask(payload, { status: trigger(settings, "jira.statusStartsWork"), label: trigger(settings, "jira.labelStartsWork") });
  if (!ready) return "ignored";
  // Work already started on its branch: nothing to offer.
  if (await getTaskPr(ready.taskKey)) return "ignored";
  const assignee = ready.assigneeEmail ? await developerIdByEmail(ready.assigneeEmail) : null;
  const to = assignee ? [assignee] : await userIdsWithRole("developer");
  await notify(to, {
    kind: "task_ready",
    title: `${ready.taskKey} is ready to start`,
    body: [ready.summary, ready.epicKey ? `Epic ${ready.epicKey}` : "", assignee ? "" : "Not matched to a developer: offered to every developer."].filter(Boolean).join("\n"),
    link: "/app/jira",
    taskKey: ready.taskKey,
  });
  await writeAudit({ actorId: null, actorRole: null, action: "task.ready", entityType: "jira_issue", entityId: ready.taskKey, metadata: { reason: ready.reason, epicKey: ready.epicKey, assigned: Boolean(assignee), notified: to.length } });
  return "handled";
}
