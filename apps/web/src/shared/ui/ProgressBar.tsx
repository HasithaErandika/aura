export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <span className="text-xs text-ink-600 tabular-nums">{pct}%</span>
    </div>
  );
}
