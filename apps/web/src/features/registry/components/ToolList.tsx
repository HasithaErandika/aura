import type { RegistryAgent } from "@/shared/api/types.ts";
import { Chip } from "@/shared/ui/Chip.tsx";

export function ToolList({ tools }: { tools: RegistryAgent["tools"] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Tools</p>
      {tools.length === 0 ? (
        <p className="mt-1 text-sm text-ink-500">No tools</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {tools.map((tool) => (
            <li key={tool.id} className="max-w-full">
              <Chip mono title={tool.description ?? undefined}>
                {tool.id}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
