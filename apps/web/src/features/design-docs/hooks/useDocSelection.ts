import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { designDocsApi } from "../api.ts";
import { firstDocument, normalizeKey } from "../lib/docs.ts";
import type { DocEpic, DocKind } from "../types.ts";

export function useDocSelection(kinds: DocKind[]) {
  const [params, setParams] = useSearchParams();
  const epicKey = normalizeKey(params.get("epic"));
  const docId = params.get("doc");
  const kindsKey = kinds.join(",");

  const epicsState = useAsync(() => designDocsApi.epics(kinds), [kindsKey]);
  const listState = useAsync(() => (epicKey ? designDocsApi.list(epicKey, kinds) : Promise.resolve(null)), [epicKey, kindsKey]);

  const select = useCallback(
    (next: { epic?: string | null; doc?: string | null }) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next.epic !== undefined) {
            if (next.epic) p.set("epic", next.epic);
            else p.delete("epic");
            p.delete("doc");
          }
          if (next.doc !== undefined) {
            if (next.doc) p.set("doc", next.doc);
            else p.delete("doc");
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const epics = epicsState.data?.epics;
  useEffect(() => {
    const first = epics?.[0];
    if (!epicKey && first) select({ epic: first.epicKey });
  }, [epicKey, epics, select]);

  const documents = listState.data?.documents;
  useEffect(() => {
    if (!epicKey || docId || !documents) return;
    const first = firstDocument(documents, kinds);
    if (first) select({ doc: first.id });
  }, [epicKey, docId, documents, kinds, select]);

  const known = epics ?? [];
  const epicOptions: DocEpic[] = epicKey && !known.some((e) => e.epicKey === epicKey) ? [{ epicKey, documents: 0, updatedAt: "" }, ...known] : known;
  const editable = listState.data?.editableKinds ?? epicsState.data?.editableKinds ?? [];

  return { epicKey, docId, select, epicsState, listState, epicOptions, editable };
}
