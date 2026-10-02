import type { ReactNode } from "react";
import { DocumentIcon } from "@/shared/icons/index.tsx";
import { Card } from "@/shared/ui/Card.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { ErrorAlert } from "@/shared/ui/ErrorAlert.tsx";
import { LoadingState } from "@/shared/ui/LoadingState.tsx";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { SplitPane } from "@/shared/ui/SplitPane.tsx";
import { useDocSelection } from "../hooks/useDocSelection.ts";
import { ADDABLE_KINDS } from "../lib/docs.ts";
import type { DocKind } from "../types.ts";
import { DocumentList } from "./DocumentList.tsx";
import { DocumentView } from "./DocumentView.tsx";
import { EpicPicker } from "./EpicPicker.tsx";
import { NewDocumentForm } from "./NewDocumentForm.tsx";

export function DocumentsWorkspace({ title, description, kinds, notice }: { title: string; description: string; kinds: DocKind[]; notice?: ReactNode }) {
  const { epicKey, docId, select, epicsState, listState, epicOptions, editable } = useDocSelection(kinds);
  const addable = ADDABLE_KINDS.filter((k) => kinds.includes(k) && editable.includes(k));

  let body: ReactNode;
  if (!epicsState.data && epicsState.error) body = <ErrorAlert error={epicsState.error} onRetry={() => void epicsState.reload()} />;
  else if (!epicsState.data) body = <LoadingState />;
  else if (epicOptions.length === 0)
    body = (
      <Card>
        <EmptyState icon={<DocumentIcon className="size-5" />} title="No documents yet" description="Documents appear here once an agent's draft is approved at its gate." />
      </Card>
    );
  else
    body = (
      <SplitPane
        listWidth="lg:grid-cols-[280px_minmax(0,1fr)]"
        list={
          <>
            <div className="border-b border-line p-3">
              <EpicPicker epics={epicOptions} value={epicKey} onChange={(epic) => select({ epic })} />
            </div>
            <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
              <DocumentList documents={listState.data?.documents ?? null} kinds={kinds} error={listState.error} selectedId={docId} onSelect={(doc) => select({ doc })} onRetry={() => void listState.reload()} />
              {epicKey
                ? addable.map((kind) => (
                    <NewDocumentForm
                      key={kind}
                      epicKey={epicKey}
                      kind={kind}
                      onCreated={async (doc) => {
                        await listState.reload();
                        select({ doc: doc.id });
                      }}
                    />
                  ))
                : null}
            </div>
          </>
        }
        detail={docId ? <DocumentView key={docId} id={docId} editable={editable} onSaved={() => void listState.reload()} /> : <EmptyState icon={<DocumentIcon className="size-5" />} title="Pick a document" />}
      />
    );

  return (
    <>
      <PageHeader title={title} description={description} />
      {notice}
      {body}
    </>
  );
}
