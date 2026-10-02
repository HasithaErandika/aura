import type { RegistryAgent } from "@/shared/api/types.ts";
import { AgentIcon } from "@/shared/icons/agentIcons.tsx";
import { agentSurface } from "@/shared/lib/agents.ts";
import { gateNumberLabel } from "@/shared/lib/pipeline.ts";
import { roleLabel } from "@/shared/lib/roles.ts";
import { Badge } from "@/shared/ui/Badge.tsx";
import { Card } from "@/shared/ui/Card.tsx";
import { CardBody } from "@/shared/ui/CardBody.tsx";
import { KeyValueList } from "@/shared/ui/KeyValueList.tsx";
import { RoleList } from "./RoleList.tsx";
import { ToolList } from "./ToolList.tsx";

function signOff(agent: RegistryAgent): string {
  if (!agent.approverRole) return "Not gated directly";
  return agent.gate ? `${roleLabel(agent.approverRole)} (${gateNumberLabel(agent.gate.gate)})` : roleLabel(agent.approverRole);
}

export function AgentCard({ agent }: { agent: RegistryAgent }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4 border-b border-line px-4 py-4 sm:px-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-neutral-soft" aria-hidden>
          <AgentIcon agentId={agent.id} className="size-12" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-900">{agent.name}</h2>
            <span className="font-mono text-xs text-ink-400">{agent.id}</span>
          </div>
          {agent.description ? <p className="mt-1 text-xs text-ink-500">{agent.description}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="outline">{agentSurface(agent.id) === "vscode" ? "VS Code" : "Web"}</Badge>
            {agent.access ? <Badge tone={agent.access === "run" ? "success" : "neutral"}>{agent.access === "run" ? "You can run" : "Read only"}</Badge> : null}
          </div>
        </div>
      </div>
      <CardBody className="space-y-4">
        <KeyValueList
          items={[
            { label: "Model", value: agent.model ?? "Not reported" },
            { label: "Memory", value: agent.supportsMemory ? "Enabled" : "None" },
            { label: "Max steps", value: agent.maxSteps ?? "Default" },
            { label: "Human sign-off", value: signOff(agent) },
          ]}
        />
        {agent.gate ? <p className="text-xs text-ink-500">On approval: {agent.gate.outcome}</p> : null}
        <ToolList tools={agent.tools} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RoleList label="Can run" roles={agent.grants.run} />
          <RoleList label="Can read" roles={agent.grants.read} />
        </div>
      </CardBody>
    </Card>
  );
}
