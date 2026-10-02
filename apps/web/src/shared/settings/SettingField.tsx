import { useEffect, useState } from "react";
import { describeError } from "../api/errors.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { Input } from "../ui/Input.tsx";
import { Select } from "../ui/Select.tsx";
import type { SettingDefinition, SettingValue } from "./api.ts";

export function SettingField({
  definition,
  stored,
  inherited,
  inheritedFrom,
  onSave,
  onReset,
}: {
  definition: SettingDefinition;
  stored: SettingValue | undefined;
  inherited: SettingValue;
  inheritedFrom: string;
  onSave: (value: SettingValue) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(stored === undefined ? "" : String(stored));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(stored === undefined ? "" : String(stored)), [stored]);

  const { input } = definition;
  const parsed: SettingValue | null = draft === "" ? null : input.type === "integer" ? Number(draft) : draft;
  const valid = parsed !== null && (input.type === "enum" ? input.options.includes(String(parsed)) : Number.isInteger(parsed) && Number(parsed) >= input.min && Number(parsed) <= input.max);
  const changed = parsed !== null && parsed !== stored;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const format = (v: SettingValue) => (typeof v === "number" ? v.toLocaleString() : String(v));
  const unit = input.type === "integer" && input.unit ? ` ${input.unit}` : "";

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-line px-5 py-4 first:border-t-0 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink-900">{definition.label}</span>
          {stored !== undefined ? <Badge tone="brand">Set here</Badge> : <Badge tone="outline">{`${format(inherited)}${unit} · ${inheritedFrom}`}</Badge>}
        </div>
        <p className="mt-1 text-xs text-ink-600">{definition.description}</p>
        {input.type === "integer" ? (
          <p className="mt-1 text-[11px] text-ink-500">
            {input.min.toLocaleString()}–{input.max.toLocaleString()}
            {unit}
            {definition.cap ? " · a personal value can't exceed the project limit" : ""}
          </p>
        ) : null}
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {input.type === "enum" ? (
          <Select aria-label={definition.label} value={draft} onChange={(e) => setDraft(e.target.value)} className="w-36">
            <option value="">{`Inherit (${format(inherited)})`}</option>
            {input.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            aria-label={definition.label}
            type="number"
            min={input.min}
            max={input.max}
            step={1}
            placeholder={format(inherited)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-36"
          />
        )}
        <Button size="sm" variant="primary" loading={busy} disabled={!valid || !changed} onClick={() => void run(() => onSave(parsed as SettingValue))}>
          Save
        </Button>
        <Button size="sm" variant="ghost" disabled={busy || stored === undefined} onClick={() => void run(onReset)}>
          Reset
        </Button>
      </div>
    </div>
  );
}
