import { env } from "@/config/env.ts";
import { useProfile } from "@/shared/auth/useAuth.ts";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { ExternalLinkIcon, RegistryIcon } from "@/shared/icons/index.tsx";
import { isAdmin } from "@/shared/lib/access.ts";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { buttonClass } from "@/shared/ui/buttonStyles.ts";
import { Card } from "@/shared/ui/Card.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { registryApi } from "./api.ts";
import { AgentCard } from "./components/AgentCard.tsx";
import { AgentCardSkeleton } from "./components/AgentCardSkeleton.tsx";

const grid = "grid grid-cols-1 gap-4 lg:grid-cols-2";

export function RegistryPage() {
  const me = useProfile();
  const state = useAsync(() => registryApi.list(), []);

  return (
    <>
      <PageHeader
        title="Agent Registry"
        description="The agents the runtime exposes and the roles that can run or read each one."
        actions={
          isAdmin(me) ? (
            <a href={env.runtimeStudioUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <ExternalLinkIcon className="size-4" aria-hidden />
              Open Mastra Studio
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null
        }
      />
      <AsyncView
        state={state}
        loading={
          <div className={grid}>
            <AgentCardSkeleton />
            <AgentCardSkeleton />
          </div>
        }
        isEmpty={(agents) => agents.length === 0}
        empty={
          <Card>
            <EmptyState icon={<RegistryIcon className="size-5" />} title="No agents available" description="The runtime is offline or your role cannot read any agent." />
          </Card>
        }
      >
        {(agents) => (
          <div className={grid}>
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </AsyncView>
    </>
  );
}
