import type { Run } from "@/shared/api/types.ts";
import { agentLabel } from "@/shared/lib/agents.ts";
import { duration, formatDateTime } from "@/shared/lib/format.ts";
import { CardBody } from "@/shared/ui/CardBody.tsx";
import { KeyValueList } from "@/shared/ui/KeyValueList.tsx";
import { Section } from "@/shared/ui/Section.tsx";

const mono = (text: string) => <span className="font-mono text-xs break-all">{text}</span>;

export function RunDetailsCard({ run }: { run: Run }) {
  return (
    <Section title="Details">
      <CardBody>
        <KeyValueList
          columns={1}
          items={[
            { label: "Entry agent", value: agentLabel(run.agentId) },
            { label: "Agents involved", value: run.agentsInvolved.length ? run.agentsInvolved.map(agentLabel).join(", ") : "None yet" },
            { label: "Current agent", value: agentLabel(run.currentAgent) },
            { label: "Duration", value: duration(run.startedAt, run.finishedAt) },
            { label: "Finished", value: run.finishedAt ? formatDateTime(run.finishedAt) : "In progress" },
            { label: "Runtime run id", value: mono(run.runtimeRunId ?? "Not assigned") },
            { label: "Run id", value: mono(run.id) },
          ]}
        />
      </CardBody>
    </Section>
  );
}
