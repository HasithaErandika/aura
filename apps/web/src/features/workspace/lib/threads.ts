import type { Thread } from "../types.ts";

export const threadTitle = (thread: Pick<Thread, "title"> | null | undefined): string => thread?.title?.trim() || "Untitled conversation";

export function replaceThread(threads: Thread[], next: Thread): Thread[] {
  const rest = threads.filter((t) => t.id !== next.id);
  return [next, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
