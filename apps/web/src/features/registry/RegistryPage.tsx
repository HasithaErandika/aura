import { useAsync } from "../../shared/hooks/useAsync.ts";
import { registryApi } from "./api.ts";
import { env } from "../../config/env.ts";
import { useAuth } from "../../shared/auth/useAuth.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card, CardBody, CardHeader } from "../../shared/ui/Card.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { KeyValueList } from "../../shared/ui/KeyValue.tsx";
import { ExternalLinkIcon, RegistryIcon } from "../../shared/icons/index.tsx";
import { AgentIcon } from "../../shared/icons/agentIcons.tsx";
import { roleLabel } from "../../shared/lib/roles.ts";

export function RegistryPage() {
  const { profile } = useAuth();
  const state = useAsync(() => registryApi.list(), []);

  return (
    <>
      <PageHeader
        title="Agent Registry"
        description="Agents as the runtime currently exposes them, with the grants the policy tables attach to each. Definitions live in apps/agent-runtime."
        actions={
          profile?.role === "admin" ? (
            <a href={env.runtimeStudioUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary" icon={<ExternalLinkIcon className="size-4" />}>
                Open Mastra Studio
              </Button>
            </a>
          ) : null
        }
      />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      {state.loading && !state.data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </Card>
          ))}
        </div>
      ) : !state.data || state.data.length === 0 ? (
        <Card>
          <EmptyState icon={<RegistryIcon className="size-5" />} title="No agents available" description="Either the runtime is offline or your role has no read grant on any agent." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {state.data.map((agent) => (
            <Card key={agent.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-4">
                    <span className="flex size-15 shrink-0 items-center justify-center rounded-2xl border border-line bg-neutral-soft">
                      <AgentIcon agentId={agent.id} className="size-15" />
                    </span>
                    <span className="flex items-center gap-2">
                      {agent.name}
                      <span className="font-mono text-xs font-normal text-ink-400">{agent.id}</span>
                    </span>
                  </span>
                }
                description={agent.description ?? undefined}
                actions={agent.access ? <Badge tone={agent.access === "run" ? "success" : "neutral"}>{agent.access === "run" ? "You can run" : "Read only"}</Badge> : null}
              />
              <CardBody className="space-y-4">
                <KeyValueList
                  items={[
                    { label: "Model", value: agent.model ?? "not reported" },
                    { label: "Memory", value: agent.supportsMemory ? "enabled" : "none" },
                    { label: "Max steps", value: agent.maxSteps ?? "default" },
                    { label: "Human sign-off", value: agent.approverRole ? `${roleLabel(agent.approverRole)}${agent.gate ? ` (Gate ${agent.gate.gate})` : ""}` : "not gated directly" },
                  ]}
                />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Tools</p>
                  {agent.tools.length === 0 ? (
                    <p className="mt-1 text-sm text-ink-500">No tools</p>
                  ) : (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {agent.tools.map((tool) => (
                        <li key={tool.id} title={tool.description ?? undefined} className="rounded-md border border-line bg-ink-50 px-2 py-0.5 font-mono text-[11px] text-ink-700">
                          {tool.id}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Can run</p>
                    <p className="mt-1 text-sm text-ink-700">{agent.grants.run.length ? agent.grants.run.map(roleLabel).join(", ") : "nobody"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Can read</p>
                    <p className="mt-1 text-sm text-ink-700">{agent.grants.read.length ? agent.grants.read.map(roleLabel).join(", ") : "nobody"}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
