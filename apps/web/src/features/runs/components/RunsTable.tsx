import { Link } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import type { Run } from "@/shared/api/types.ts";
import { RunStatusPill } from "@/shared/components/RunStatusPill.tsx";
import { agentLabel } from "@/shared/lib/agents.ts";
import { duration, formatDateTime, personName, truncate } from "@/shared/lib/format.ts";
import { roleLabel } from "@/shared/lib/roles.ts";
import { Table, TBody, TD, TH, THead, TR } from "@/shared/ui/Table.tsx";

function agentsText(run: Run): string {
  return run.agentsInvolved.length ? run.agentsInvolved.map(agentLabel).join(", ") : agentLabel(run.agentId);
}

export function RunsTable({ runs }: { runs: Run[] }) {
  return (
    <Table minWidth="min-w-[760px]">
      <THead>
        <TR>
          <TH>Request</TH>
          <TH>Status</TH>
          <TH>Agents</TH>
          <TH>Requested by</TH>
          <TH>Started</TH>
          <TH>Duration</TH>
        </TR>
      </THead>
      <TBody>
        {runs.map((run) => (
          <TR key={run.id} className="hover:bg-ink-50">
            <TD>
              <Link to={paths.run(run.id)} className="font-medium text-ink-900 hover:underline">
                {run.title ? truncate(run.title, 80) : "Untitled run"}
              </Link>
            </TD>
            <TD>
              <RunStatusPill status={run.status} />
            </TD>
            <TD className="text-xs text-ink-600">{agentsText(run)}</TD>
            <TD>
              <span className="block text-sm text-ink-800">{personName(run.requester, "")}</span>
              <span className="block text-xs text-ink-500">{roleLabel(run.requestedByRole)}</span>
            </TD>
            <TD className="text-xs whitespace-nowrap text-ink-600">{formatDateTime(run.startedAt)}</TD>
            <TD className="text-xs text-ink-600 tabular-nums">{duration(run.startedAt, run.finishedAt)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
