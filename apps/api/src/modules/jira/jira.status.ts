import type { JiraTransition } from "./jira.types.js";

export type StatusMove = { kind: "move"; transitionId: string } | { kind: "already" } | { kind: "behind" } | { kind: "unreachable" };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Moves only forward along `order`: a late event (an old PR reopened) never pulls a Task back.
export function chooseTransition(current: string, target: string, transitions: JiraTransition[], order: readonly string[]): StatusMove {
  if (same(current, target)) return { kind: "already" };
  const at = order.findIndex((s) => same(s, current));
  const to = order.findIndex((s) => same(s, target));
  if (at >= 0 && to >= 0 && at > to) return { kind: "behind" };
  const transition = transitions.find((t) => same(t.toStatus, target)) ?? transitions.find((t) => same(t.name, target));
  return transition ? { kind: "move", transitionId: transition.id } : { kind: "unreachable" };
}
