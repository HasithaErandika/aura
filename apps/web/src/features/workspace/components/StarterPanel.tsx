import { AgentLiveIcon, ArrowRightIcon } from "@/shared/icons/index.tsx";
import { Badge } from "@/shared/ui/Badge.tsx";
import { Card } from "@/shared/ui/Card.tsx";
import type { StarterInfo } from "../lib/starters.ts";

export function StarterPanel({ agentName, role, info, disabled, onPick }: { agentName: string; role: string; info: StarterInfo; disabled: boolean; onPick: (text: string) => void }) {
  return (
    <Card className="mx-auto my-6 max-w-2xl p-6 text-center sm:p-8">
      <div className="flex justify-center" aria-hidden>
        <AgentLiveIcon size={48} />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-ink-900">Brief the {agentName}</h2>
      <div className="mt-1.5">
        <Badge>{role}</Badge>
      </div>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-500">{info.guide}</p>
      <ul className="mt-6 space-y-2 text-left">
        {info.prompts.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(prompt)}
              className="group flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-subtle px-4 py-3 text-left text-xs font-medium text-ink-800 transition-colors hover:border-ink-400 hover:bg-surface focus-visible:ring-2 focus-visible:ring-ink-300 focus-visible:outline-none disabled:opacity-50"
            >
              <span className="min-w-0 break-words">{prompt}</span>
              <ArrowRightIcon className="size-3.5 shrink-0 text-ink-400 group-hover:text-ink-700" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
