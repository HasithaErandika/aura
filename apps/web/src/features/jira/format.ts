import type { JiraStatusCategory } from "../../types/api.ts";
import type { Tone } from "../../shared/ui/Badge.tsx";

// Shared between JiraPage and anything else that renders a Jira issue badge (TaskModal), so a
// status/priority always reads the same color everywhere it appears.
export const STATUS_TONE: Record<JiraStatusCategory, Tone> = { new: "neutral", indeterminate: "warning", done: "success" };

const PRIORITY_TONE: Record<string, Tone> = {
  highest: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
  lowest: "neutral",
};

export function priorityTone(priority: string | null): Tone {
  return priority ? (PRIORITY_TONE[priority.toLowerCase()] ?? "neutral") : "neutral";
}
