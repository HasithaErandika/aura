import { useState } from "react";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { timeAgo } from "@/shared/lib/format.ts";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { Badge } from "@/shared/ui/Badge.tsx";
import { Markdown } from "@/shared/ui/Markdown.tsx";
import { Tabs, type TabItem } from "@/shared/ui/Tabs.tsx";
import { designDocsApi } from "../api.ts";
import { KIND_LABELS } from "../lib/docs.ts";
import type { DocKind } from "../types.ts";
import { DocumentEditor } from "./DocumentEditor.tsx";
import { VersionHistory } from "./VersionHistory.tsx";

type Tab = "preview" | "edit" | "history";

export function DocumentView({ id, editable, onSaved }: { id: string; editable: DocKind[]; onSaved: () => void }) {
  const state = useAsync(() => designDocsApi.get(id), [id]);
  const [tab, setTab] = useState<Tab>("preview");

  return (
    <AsyncView state={state} errorClassName="m-5">
      {({ document: doc, content, versions }) => {
        const canEdit = editable.includes(doc.kind);
        const items: Array<TabItem<Tab>> = [{ value: "preview", label: "Preview" }, ...(canEdit ? [{ value: "edit" as const, label: "Edit" }] : []), { value: "history", label: "History", count: versions.length }];
        const meta = [KIND_LABELS[doc.kind], doc.epicKey, doc.issueKey, `updated ${timeAgo(doc.updatedAt)}`].filter(Boolean).join(" · ");
        return (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-base font-semibold break-words text-ink-900">{doc.title}</h2>
                <p className="mt-0.5 text-xs text-ink-500">{meta}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="outline">v{doc.currentVersion}</Badge>
                {canEdit ? null : <Badge>Read only</Badge>}
              </div>
            </div>
            <div className="px-4 sm:px-5">
              <Tabs label="Document view" value={tab} onChange={setTab} items={items} />
            </div>
            <div className="scroll-quiet min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
              {tab === "preview" ? (
                <Markdown source={content} />
              ) : tab === "edit" && canEdit ? (
                <DocumentEditor
                  doc={doc}
                  content={content}
                  onSaved={async () => {
                    await state.reload();
                    onSaved();
                    setTab("preview");
                  }}
                />
              ) : (
                <VersionHistory docId={doc.id} versions={versions} />
              )}
            </div>
          </div>
        );
      }}
    </AsyncView>
  );
}
