import { useSearchParams } from "react-router-dom";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { usePolling } from "@/shared/hooks/usePolling.ts";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { Section } from "@/shared/ui/Section.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";
import { Table, TBody, TH, THead, TR } from "@/shared/ui/Table.tsx";
import { taskPrsApi } from "../api.ts";
import { normalizeKey } from "../lib/docs.ts";
import { TaskPrRow } from "./TaskPrRow.tsx";

export function TaskPrsPanel() {
  const [params] = useSearchParams();
  const epicKey = normalizeKey(params.get("epic"));
  const focus = normalizeKey(params.get("task"));
  const state = useAsync(() => taskPrsApi.list(epicKey), [epicKey]);
  usePolling(state.reload, 60_000, true);

  return (
    <Section title="Pull requests and CI" description={epicKey ? `Tasks of ${epicKey} with a pull request` : "Tasks with a pull request"}>
      <AsyncView
        state={state}
        loading={<SkeletonRows rows={2} />}
        errorClassName="m-4"
        isEmpty={(prs) => prs.length === 0}
        empty={<EmptyState title="No pull requests yet" description="Developers open them from VS Code at Gate 6." className="py-8" />}
      >
        {(prs) => (
          <Table>
            <THead>
              <TR>
                <TH>Task</TH>
                <TH>Pull request</TH>
                <TH>CI</TH>
                <TH>Reviewers</TH>
                <TH>Updated</TH>
              </TR>
            </THead>
            <TBody>
              {prs.map((pr) => (
                <TaskPrRow key={pr.taskKey} pr={pr} focused={pr.taskKey === focus} />
              ))}
            </TBody>
          </Table>
        )}
      </AsyncView>
    </Section>
  );
}
