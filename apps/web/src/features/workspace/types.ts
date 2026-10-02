import type { Approval, Run, ToolActivityItem } from "@/shared/api/types.ts";

export interface Thread {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  tools: ToolActivityItem[];
  createdAt: string | null;
}

export interface ThreadHistory {
  thread: Thread;
  messages: ChatMessage[];
  latestRun: Run | null;
  pendingApproval: Approval | null;
}
