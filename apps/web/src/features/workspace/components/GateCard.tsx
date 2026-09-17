import { useState, type FormEvent } from "react";
import type { Decision } from "../../../types/api.ts";
import type { PendingGate } from "../hooks/useConversation.ts";
import { Button } from "../../../shared/ui/Button.tsx";
import { Badge } from "../../../shared/ui/Badge.tsx";
import { Field, Textarea } from "../../../shared/ui/Field.tsx";
import { roleLabel } from "../../../shared/lib/roles.ts";
import { timeUntil } from "../../../shared/lib/format.ts";
import { cn } from "../../../shared/lib/cn.ts";
import { GateIcon } from "../../../shared/icons/index.tsx";

type Intent = { decision: Decision; label: string; needsReason: boolean };

// Maps the options the Orchestrator offered to a decision the API records. The wording comes
// from the runtime; classification is by keyword so a new option still reaches the model.
function classify(label: string): Intent {
  const l = label.toLowerCase();
  if (/reject|decline|cancel|stop|abort|\bno\b/.test(l)) return { decision: "reject", label, needsReason: true };
  if (/revis|change|edit|feedback|modify|adjust/.test(l)) return { decision: "revise", label, needsReason: true };
  if (/approv|accept|continue|proceed|\byes\b|confirm|file|go ahead/.test(l)) return { decision: "approve", label, needsReason: false };
  return { decision: "answer", label, needsReason: false };
}

export function GateCard({
  gate,
  busy,
  onDecide,
  compact,
}: {
  gate: PendingGate;
  busy: boolean;
  onDecide: (body: { decision: Decision; answer?: string; reason?: string }) => void;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<Intent | null>(null);
  const [reason, setReason] = useState("");
  const [freeText, setFreeText] = useState("");

  const hasOptions = gate.options.length > 0;
  const intents = gate.options.map((o) => classify(o.label));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!gate.canDecide || busy) return;
    if (hasOptions) {
      if (!selected) return;
      if (selected.needsReason && !reason.trim()) return;
      onDecide({ decision: selected.decision, answer: selected.label, reason: reason.trim() || undefined });
    } else {
      if (!freeText.trim()) return;
      onDecide({ decision: "answer", answer: freeText.trim() });
    }
  }

  const heading = gate.gate ? `Gate ${gate.gate.number}: ${gate.gate.name}` : "The agent needs your input";

  return (
    <form onSubmit={submit} className={cn("rounded-xl border border-warning/30 bg-surface shadow-sm", compact ? "" : "max-w-[48rem]")}>
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning">
          <GateIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink-900">{heading}</p>
            <Badge tone="warning" dot>
              Human in the loop
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            {gate.requiredRole ? `Requires ${roleLabel(gate.requiredRole)}` : "For the person who started this run"}
            {gate.expiresAt ? ` · ${timeUntil(gate.expiresAt)}` : ""}
            {gate.gate ? ` · On approval: ${gate.gate.outcome}` : ""}
          </p>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <p className="text-sm text-ink-800">{gate.question}</p>

        {!gate.canDecide ? (
          <div className="rounded-md border border-line bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
            {gate.requiredRole
              ? `Waiting for a ${roleLabel(gate.requiredRole)} to decide. This conversation will continue automatically once they do.`
              : "Waiting for the requester to answer."}
          </div>
        ) : hasOptions ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {gate.options.map((option, i) => {
              const intent = intents[i]!;
              const active = selected?.label === option.label;
              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={busy}
                  onClick={() => setSelected(intent)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                    active ? "border-ink-900 bg-ink-900 text-on-dark" : "border-line-strong bg-surface text-ink-800 hover:bg-ink-50",
                  )}
                >
                  <span className="block font-medium">{option.label}</span>
                  {option.description ? <span className={cn("mt-0.5 block text-xs", active ? "text-ink-300" : "text-ink-500")}>{option.description}</span> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <Field label="Your answer">
            <Textarea rows={3} value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="Type your answer" disabled={busy} />
          </Field>
        )}

        {gate.canDecide && selected?.needsReason ? (
          <Field label={selected.decision === "reject" ? "Reason for rejecting (required)" : "What should change (required)"}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Be specific. This is passed to the agent verbatim and recorded in the audit trail." disabled={busy} />
          </Field>
        ) : gate.canDecide && selected && hasOptions ? (
          <Field label="Note (optional)">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded with your decision" disabled={busy} />
          </Field>
        ) : null}

        {gate.canDecide ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="submit"
              variant={selected?.decision === "reject" ? "danger" : "primary"}
              loading={busy}
              disabled={hasOptions ? !selected || (selected.needsReason && !reason.trim()) : !freeText.trim()}
            >
              {selected ? `Confirm: ${selected.label}` : hasOptions ? "Choose an option" : "Send answer"}
            </Button>
          </div>
        ) : null}
      </div>
    </form>
  );
}
