import type { Decision } from "../api/types.ts";

export interface DecisionIntent {
  decision: Decision;
  label: string;
  needsReason: boolean;
}

export function classifyOption(label: string): DecisionIntent {
  const l = label.toLowerCase();
  if (/reject|decline|cancel|stop|abort|\bno\b/.test(l)) return { decision: "reject", label, needsReason: true };
  if (/revis|change|edit|feedback|modify|adjust/.test(l)) return { decision: "revise", label, needsReason: true };
  if (/approv|accept|continue|proceed|\byes\b|confirm|file|go ahead/.test(l)) return { decision: "approve", label, needsReason: false };
  return { decision: "answer", label, needsReason: false };
}
