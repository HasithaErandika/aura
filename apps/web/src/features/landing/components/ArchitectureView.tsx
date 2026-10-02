import { ARCH_LAYERS } from "../lib/content.ts";

export function ArchitectureView() {
  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-ink-600">Decisions, policy and audit sit outside the agent runtime.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ARCH_LAYERS.map((layer, i) => (
          <div key={layer.title} className="rounded-xl border border-line bg-canvas p-5 shadow-sm">
            <span className="inline-block rounded-md border border-line bg-surface px-2 py-0.5 text-[10px] font-bold tracking-wider text-ink-600 uppercase">{layer.tag}</span>
            <h4 className="mt-3 text-base font-bold text-ink-900">
              {i + 1}. {layer.title}
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">{layer.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
