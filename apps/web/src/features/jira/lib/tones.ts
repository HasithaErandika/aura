import type { Tone } from "@/shared/lib/tone.ts";
import type { JiraStatusCategory } from "../types.ts";

export const STATUS_TONE: Record<JiraStatusCategory, Tone> = { new: "neutral", indeterminate: "warning", done: "success" };

const PRIORITY_TONE: Record<string, Tone> = { highest: "danger", high: "danger", medium: "warning", low: "neutral", lowest: "neutral" };

export function priorityTone(priority: string | null): Tone {
  return priority ? (PRIORITY_TONE[priority.toLowerCase()] ?? "neutral") : "neutral";
}
