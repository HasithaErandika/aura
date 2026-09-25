import type { CouncilTurn, RunStatus, TurnEvent } from "@aura/client";
import { c, indent, out, write } from "./ui.js";

// Prints a streamed turn (a chat turn or an approval's resumed run) as it happens, and returns
// what the caller needs next: how it ended, the gate to decide (if it suspended), and the
// Coding Agent draft id (if one was drafted or executed in this turn).

export interface TurnOutcome {
  status: RunStatus | "UNKNOWN";
  approvalId: string | null;
  draftId: string | null;
  error: string | null;
}

const ROLE_LABEL: Record<CouncilTurn["role"], (s: string) => string> = {
  planner: (s) => c.blue(s),
  implementer: (s) => c.magenta(s),
  reviewer: (s) => c.cyan(s),
  system: (s) => c.gray(s),
};

const ROLE_NAME: Record<CouncilTurn["role"], string> = {
  planner: "Planner",
  implementer: "Implementer",
  reviewer: "Reviewer",
  system: "AURA",
};

function shortModel(model?: string): string {
  return model ? c.gray(` (${model.split("/").slice(-1)[0]})`) : "";
}

export function renderCouncilTurn(turn: CouncilTurn): void {
  const who = ROLE_LABEL[turn.role](c.bold(ROLE_NAME[turn.role]));
  const where = c.gray(`[round ${turn.round} · ${turn.phase}]`);

  if (turn.status === "started") {
    out(`${where} ${who}${shortModel(turn.model)} ${c.gray("is working…")}`);
    return;
  }
  if (turn.status === "waiting") {
    out(`${where} ${who} ${c.yellow(`⏳ ${turn.text ?? "waiting"}`)}`);
    return;
  }
  if (turn.status === "error") {
    out(`${where} ${who} ${c.red(turn.text ?? "failed")}`);
    return;
  }

  out(`${where} ${who}${shortModel(turn.model)}:`);
  if (turn.text) out(indent(turn.text.trim(), "  │ "));
  if (turn.checks?.length) {
    for (const check of turn.checks) {
      out(`  ${check.ok ? c.green("✓") : c.red("✗")} ${check.id}`);
      if (!check.ok && check.output) out(indent(check.output.trim().split("\n").slice(-15).join("\n"), "    "));
    }
  }
  if (turn.verdict) {
    out(`  ${turn.verdict === "APPROVE" ? c.green(c.bold("APPROVE")) : c.yellow(c.bold("CHANGES REQUESTED"))}`);
    for (const issue of turn.issues ?? []) {
      const loc = issue.line ? `${issue.file}:${issue.line}` : issue.file;
      out(`  - ${c.bold(loc)} ${c.gray(`[${issue.severity}]`)} ${issue.problem}`);
      if (issue.fix) out(c.gray(`      fix: ${issue.fix}`));
    }
  }
  if (turn.usage) out(c.gray(`  tokens ${turn.usage.totalTokens.toLocaleString()} / ${turn.usage.budget.toLocaleString()}`));
  out();
}

function draftIdFrom(value: unknown): string | null {
  if (value && typeof value === "object" && typeof (value as { draftId?: unknown }).draftId === "string") return (value as { draftId: string }).draftId;
  return null;
}

export async function renderTurn(events: AsyncGenerator<TurnEvent>, opts: { verbose?: boolean } = {}): Promise<TurnOutcome> {
  const outcome: TurnOutcome = { status: "UNKNOWN", approvalId: null, draftId: null, error: null };
  let midLine = false;
  const newline = () => {
    if (midLine) write("\n");
    midLine = false;
  };

  for await (const e of events) {
    switch (e.event) {
      case "text":
        write(e.data.delta);
        midLine = !e.data.delta.endsWith("\n");
        break;

      case "tool": {
        if (e.data.toolName === "delegate_to_code") outcome.draftId = draftIdFrom(e.data.result) ?? draftIdFrom(e.data.args) ?? outcome.draftId;
        if (e.data.phase === "call" && e.data.toolName !== "ask_user") {
          newline();
          const mode = (e.data.args as { mode?: string } | undefined)?.mode;
          out(c.gray(`↳ ${e.data.toolName}${mode ? ` (${mode})` : ""}`));
        } else if (e.data.phase === "error") {
          newline();
          out(c.red(`✗ ${e.data.toolName}: ${e.data.error ?? "failed"}`));
        } else if (e.data.phase === "result" && opts.verbose) {
          newline();
          out(c.gray(indent(JSON.stringify(e.data.result, null, 2).slice(0, 2000))));
        }
        break;
      }

      case "progress": {
        const chunk = typeof e.data.chunk === "string" ? e.data.chunk : null;
        if (chunk) {
          newline();
          write(c.gray(chunk.endsWith("\n") ? chunk : `${chunk}\n`));
        } else if (opts.verbose) {
          newline();
          out(c.gray(`· ${JSON.stringify(e.data)}`));
        }
        break;
      }

      case "council":
        newline();
        renderCouncilTurn(e.data);
        if (e.data.draftId) outcome.draftId = e.data.draftId;
        break;

      case "gate": {
        newline();
        outcome.approvalId = e.data.approvalId;
        const gate = e.data.gate ? `Gate ${e.data.gate.number} · ${e.data.gate.name}` : "Decision needed";
        out();
        out(c.yellow(c.bold(`◆ ${gate}`)));
        out(indent(e.data.question));
        for (const option of e.data.options) out(c.gray(`  • ${option.label}${option.description ? ` - ${option.description}` : ""}`));
        out();
        if (e.data.canDecide) out(`  ${c.bold("aura approve")}  or  ${c.bold('aura reject --reason "…"')}  or  ${c.bold('aura revise "…"')}`);
        else out(c.gray("  Waiting on someone with the required role to decide this gate."));
        out(c.gray(`  approval ${e.data.approvalId}`));
        break;
      }

      case "decision":
        newline();
        out(c.gray(`decision recorded: ${e.data.decision} → ${e.data.status}`));
        break;

      case "error":
        newline();
        outcome.error = e.data.message;
        out(c.red(`✗ ${e.data.message}`));
        break;

      case "done":
        newline();
        outcome.status = e.data.status;
        outcome.approvalId = e.data.approvalId ?? outcome.approvalId;
        break;

      case "run":
        break;
    }
  }
  newline();
  return outcome;
}
