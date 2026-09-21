import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card, CardHeader, CardBody } from "../../shared/ui/Card.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { BrainIcon, CodeIcon, SparkleIcon } from "../../shared/icons/index.tsx";

interface CliProviderMeta {
  name: string;
  usedFor: string;
  icon: typeof BrainIcon;
  loginCommand: string;
}

const CLI_PROVIDERS: CliProviderMeta[] = [
  { name: "Claude Code", usedFor: "Anthropic", icon: BrainIcon, loginCommand: "claude login" },
  { name: "Codex", usedFor: "OpenAI", icon: CodeIcon, loginCommand: "codex login" },
];

export function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Profile & connected accounts"
        description="The Coding Agent (Gate 5) can run AURA's own built-in agent, or Claude Code / Codex if you want one of those instead. Claude Code and Codex authenticate via their own CLI login on the machine running agent-runtime - there is no API key to enter or store here."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {CLI_PROVIDERS.map((meta) => (
          <CliProviderCard key={meta.name} meta={meta} />
        ))}
        <BuiltInCard />
      </div>
    </>
  );
}

// AURA's own built-in Coding Agent (provider "mastra") - always available, no login needed.
function BuiltInCard() {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-neutral-soft text-ink-600">
              <SparkleIcon className="size-4" />
            </span>
            AURA Coding Agent
          </span>
        }
        description="Built-in · main option"
        actions={
          <Badge tone="success" dot>
            Always available
          </Badge>
        }
      />
      <CardBody>
        <p className="text-xs text-ink-500">
          Runs on AURA's own model, with no external account or key. Reads and writes files directly inside a Task's own scaffolded directory - nothing more, no shell access. Select it as the coding agent when running Gate 5.
        </p>
      </CardBody>
    </Card>
  );
}

// Claude Code / Codex authenticate via a browser/CLI login run once on the machine running
// agent-runtime, not an API key - there is nothing for a human to enter or store here. This
// card is informational only; delegate_to_code (Gate 5) checks the login itself at run time and
// reports clearly if it's missing.
function CliProviderCard({ meta }: { meta: CliProviderMeta }) {
  const Icon = meta.icon;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-neutral-soft text-ink-600">
              <Icon className="size-4" />
            </span>
            {meta.name}
          </span>
        }
        description={meta.usedFor}
        actions={
          <Badge tone="neutral" dot>
            CLI login
          </Badge>
        }
      />
      <CardBody>
        <p className="text-xs text-ink-500">
          Log in once on the machine running agent-runtime:
        </p>
        <p className="mt-2 rounded-md border border-line bg-neutral-soft/40 px-3 py-2 font-mono text-xs text-ink-700">{meta.loginCommand}</p>
        <p className="mt-2 text-xs text-ink-500">Nothing to connect here - AURA uses that login directly when you select {meta.name} at Gate 5.</p>
      </CardBody>
    </Card>
  );
}
