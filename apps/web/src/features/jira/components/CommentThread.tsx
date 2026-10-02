import { useState, type FormEvent } from "react";
import { SendIcon } from "@/shared/icons/index.tsx";
import { timeAgo } from "@/shared/lib/format.ts";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { SectionTitle } from "@/shared/ui/SectionTitle.tsx";
import { Skeleton } from "@/shared/ui/Skeleton.tsx";
import { Textarea } from "@/shared/ui/Textarea.tsx";
import type { useComments } from "../hooks/useComments.ts";

export function CommentThread({ issueKey, comments }: { issueKey: string; comments: ReturnType<typeof useComments> }) {
  const [draft, setDraft] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (body && (await comments.add(body))) setDraft("");
  }

  return (
    <div>
      <SectionTitle count={comments.state.data?.length}>Comments</SectionTitle>
      <AsyncView state={comments.state} loading={<Skeleton className="h-10 w-full" />}>
        {(list) =>
          list.length === 0 ? (
            <p className="text-xs text-ink-400">No comments yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {list.map((c) => (
                <li key={c.id} className="rounded-lg border border-line bg-ink-50/60 px-3 py-2.5 text-xs">
                  <p className="flex flex-wrap items-center gap-2 text-ink-500">
                    <span className="font-medium text-ink-700">{c.author ?? "Unknown"}</span>
                    <span>{timeAgo(c.created)}</span>
                  </p>
                  <p className="mt-1 leading-relaxed break-words whitespace-pre-wrap text-ink-700">{c.body}</p>
                </li>
              ))}
            </ul>
          )
        }
      </AsyncView>
      <form onSubmit={(e) => void submit(e)} className="mt-2.5 space-y-1.5">
        <Textarea rows={2} aria-label={`Comment on ${issueKey}`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a comment" className="text-sm" />
        {comments.sendError ? (
          <p className="text-xs text-danger" role="alert">
            {comments.sendError}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button size="sm" type="submit" variant="primary" icon={<SendIcon className="size-3.5" />} loading={comments.sending} disabled={!draft.trim()}>
            Comment
          </Button>
        </div>
      </form>
    </div>
  );
}
