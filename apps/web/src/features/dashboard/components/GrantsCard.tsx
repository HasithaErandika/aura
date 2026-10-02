import type { Grants } from "@/shared/api/types.ts";
import { AgentBadge } from "@/shared/components/AgentBadge.tsx";
import { CardBody } from "@/shared/ui/CardBody.tsx";
import { Section } from "@/shared/ui/Section.tsx";

export function GrantsCard({ grants }: { grants: Grants }) {
  const entries = Object.entries(grants.agents);
  return (
    <Section title="Your grants" description="The API checks these for every request. No agent decides access.">
      <CardBody>
        {entries.length === 0 ? (
          <p className="text-sm text-ink-500">Your role has no agent grants.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {entries.map(([agent, access]) => (
              <li key={agent} className="max-w-full">
                <AgentBadge agentId={agent} detail={access === "run" ? "run" : "read only"} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Section>
  );
}
