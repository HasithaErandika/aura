import { useState } from "react";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { useDebounced } from "@/shared/hooks/useDebounced.ts";
import { LayersIcon } from "@/shared/icons/index.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { SplitPane } from "@/shared/ui/SplitPane.tsx";
import { jiraApi } from "../api.ts";
import { EpicDetail } from "./EpicDetail.tsx";
import { EpicList } from "./EpicList.tsx";

export function JiraBrowser() {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 300);
  const [picked, setPicked] = useState<string | null>(null);
  const epicsState = useAsync(() => jiraApi.epics(debounced), [debounced]);
  const selected = picked ?? epicsState.data?.[0]?.key ?? null;
  const detailState = useAsync(() => (selected ? jiraApi.epic(selected) : Promise.resolve(null)), [selected]);

  return (
    <SplitPane
      listWidth="lg:grid-cols-[320px_minmax(0,1fr)]"
      list={<EpicList state={epicsState} query={query} onQueryChange={setQuery} selected={selected} onSelect={setPicked} />}
      detail={selected ? <EpicDetail epicKey={selected} state={detailState} /> : <EmptyState icon={<LayersIcon className="size-5" />} title="Select an Epic" description="Pick an Epic to see its Stories and Tasks." className="h-full" />}
    />
  );
}
