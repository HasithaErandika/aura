import { cn } from "@/shared/lib/cn.ts";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { ErrorAlert } from "@/shared/ui/ErrorAlert.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";
import { groupByKind, KIND_LABELS } from "../lib/docs.ts";
import type { DesignDoc, DocKind } from "../types.ts";

interface DocumentListProps {
  documents: DesignDoc[] | null;
  kinds: DocKind[];
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}

export function DocumentList({ documents, kinds, error, selectedId, onSelect, onRetry }: DocumentListProps) {
  if (!documents && error) return <ErrorAlert error={error} onRetry={onRetry} className="m-3" />;
  if (!documents) return <SkeletonRows rows={3} />;
  if (documents.length === 0) return <EmptyState title="No documents for this Epic yet" className="py-8" />;

  return (
    <nav aria-label="Documents" className="space-y-4 p-3">
      {groupByKind(documents, kinds).map((group) => (
        <div key={group.kind}>
          <h3 className="px-2 pb-1 text-xs font-semibold tracking-wide text-ink-500 uppercase">{KIND_LABELS[group.kind]}</h3>
          <ul>
            {group.documents.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => onSelect(doc.id)}
                  aria-current={doc.id === selectedId ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ink-300 focus-visible:outline-none",
                    doc.id === selectedId ? "bg-ink-100 font-medium text-ink-900" : "text-ink-700 hover:bg-ink-50",
                  )}
                >
                  <span className="truncate">{doc.title}</span>
                  {doc.issueKey ? <span className="shrink-0 text-xs text-ink-500">{doc.issueKey}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
