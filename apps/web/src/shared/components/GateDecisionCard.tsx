import { useState, type FormEvent } from "react";
import type { DecisionInput, PendingGate } from "../api/types.ts";
import { GateIcon } from "../icons/index.tsx";
import { agentLabel } from "../lib/agents.ts";
import { classifyOption, type DecisionIntent } from "../lib/decision.ts";
import { timeUntil } from "../lib/format.ts";
import { gateTitle } from "../lib/pipeline.ts";
import { roleLabel } from "../lib/roles.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { Textarea } from "../ui/Textarea.tsx";
import { DecisionOption } from "./DecisionOption.tsx";

export function GateDecisionCard({ gate, busy, onDecide }: { gate: PendingGate; busy: boolean; onDecide: (body: DecisionInput) => void }) {
  const [selected, setSelected] = useState<DecisionIntent | null>(null);
  const [reason, setReason] = useState("");
  const [freeText, setFreeText] = useState("");

  const hasOptions = gate.options.length > 0;
  const reasonMissing = Boolean(selected?.needsReason && !reason.trim());
  const ready = hasOptions ? Boolean(selected) && !reasonMissing : Boolean(freeText.trim());
  const meta = [
    gate.requiredRole ? `Requires ${roleLabel(gate.requiredRole)}` : "For the person who started this run",
    gate.producingAgent ? `Drafted by ${agentLabel(gate.producingAgent)}` : null,
    gate.expiresAt ? timeUntil(gate.expiresAt) : null,
  ].filter(Boolean);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!gate.canDecide || busy || !ready) return;
    if (hasOptions && selected) onDecide({ decision: selected.decision, answer: selected.label, reason: reason.trim() || undefined });
    else onDecide({ decision: "answer", answer: freeText.trim() });
  }

  return (
    <form onSubmit={submit} className="w-full max-w-3xl rounded-xl border border-warning/30 bg-surface shadow-sm">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning" aria-hidden>
          <GateIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink-900">{gateTitle(gate.gate, "The agent needs your input")}</p>
            <Badge tone="warning" dot>
              Human in the loop
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-500">{meta.join(" · ")}</p>
          {gate.gate ? <p className="mt-0.5 text-xs text-ink-500">On approval: {gate.gate.outcome}</p> : null}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <p className="text-sm break-words whitespace-pre-wrap text-ink-800">{gate.question}</p>

        {!gate.canDecide ? (
          <p className="rounded-md border border-line bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
            {gate.requiredRole ? `Waiting for a ${roleLabel(gate.requiredRole)} to decide. This page updates once they do.` : "Waiting for the requester to answer."}
          </p>
        ) : hasOptions ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Decision options">
            {gate.options.map((option) => (
              <DecisionOption key={option.label} option={option} active={selected?.label === option.label} disabled={busy} onSelect={() => setSelected(classifyOption(option.label))} />
            ))}
          </div>
        ) : (
          <Field label="Your answer" htmlFor={`answer-${gate.approvalId}`}>
            <Textarea id={`answer-${gate.approvalId}`} rows={3} value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="Type your answer" disabled={busy} />
          </Field>
        )}

        {gate.canDecide && selected ? (
          <Field
            label={selected.needsReason ? (selected.decision === "reject" ? "Reason for rejecting (required)" : "What should change (required)") : "Note (optional)"}
            htmlFor={`reason-${gate.approvalId}`}
          >
            <Textarea
              id={`reason-${gate.approvalId}`}
              rows={selected.needsReason ? 3 : 2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={selected.needsReason ? "Be specific. The agent receives this verbatim and it is audited." : "Recorded with your decision"}
              disabled={busy}
            />
          </Field>
        ) : null}

        {gate.canDecide ? (
          <div className="flex justify-end">
            <Button type="submit" variant={selected?.decision === "reject" ? "danger" : "primary"} loading={busy} disabled={!ready}>
              {selected ? `Confirm: ${selected.label}` : hasOptions ? "Choose an option" : "Send answer"}
            </Button>
          </div>
        ) : null}
      </div>
    </form>
  );
}
