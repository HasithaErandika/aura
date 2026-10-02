import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { STATUS_LABEL, type TaskBoard } from "./task-board.js";

// The Plan view (Gate 4: the plan as a checklist, then the coders' live steps) and the Review
// view (Gate 5: changed files that open in VS Code's diff editor, check results, the Evaluator's
// findings), for the Task of the current AURA conversation (plan §4). Both read the TaskBoard the
// chat builds from the runtime's Task events; the decisions themselves are made on the gate card
// in the chat.

export const GIT_SCHEME = "aura-git";

class Item extends vscode.TreeItem {
  constructor(label: string, options: { description?: string; icon?: string; tooltip?: string; children?: Item[]; command?: vscode.Command; color?: string } = {}) {
    super(label, options.children?.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    this.description = options.description;
    this.tooltip = options.tooltip;
    this.command = options.command;
    if (options.icon) this.iconPath = new vscode.ThemeIcon(options.icon, options.color ? new vscode.ThemeColor(options.color) : undefined);
    this.children = options.children ?? [];
  }
  children: Item[];
}

abstract class BoardView implements vscode.TreeDataProvider<Item> {
  protected board: TaskBoard | null = null;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  update(board: TaskBoard | null): void {
    this.board = board;
    this.changed.fire();
  }

  getTreeItem(item: Item): vscode.TreeItem {
    return item;
  }

  getChildren(item?: Item): Item[] {
    return item ? item.children : this.roots();
  }

  protected abstract roots(): Item[];
}

export class PlanView extends BoardView {
  protected roots(): Item[] {
    const b = this.board;
    if (!b?.plan) return [];
    const done = b.status === "code-review" || b.status === "accepted";
    const steps = b.plan.steps.map(
      (s, i) =>
        new Item(`${i + 1}. ${s.title}`, {
          icon: done ? "pass" : b.status === "coding" ? "circle-large-outline" : "circle-outline",
          tooltip: [s.detail, s.files.length ? `Files: ${s.files.join(", ")}` : ""].filter(Boolean).join("\n"),
          children: s.files.map((f) => new Item(f, { icon: "file" })),
        }),
    );
    const roots = [
      new Item(`${b.taskKey}`, { description: STATUS_LABEL[b.status], icon: b.status === "accepted" ? "pass-filled" : "tasklist", tooltip: b.plan.summary }),
      new Item("Coder", { description: `${b.coder} (${b.route})`, icon: "person" }),
      new Item("Steps", { children: steps, icon: "list-ordered" }),
      new Item("Checks", { icon: "beaker", children: b.plan.checks.map((c) => new Item(c, { icon: "terminal" })) }),
    ];
    if (b.plan.risks.length) roots.push(new Item("Risks", { icon: "warning", children: b.plan.risks.map((r) => new Item(r, { tooltip: r })) }));
    if (b.activity.length) {
      roots.push(new Item("Activity", { icon: "pulse", description: b.maxRounds ? `round ${b.round} of ${b.maxRounds}` : undefined, children: b.activity.slice(-25).map((a) => new Item(a.trim(), { tooltip: a })) }));
    }
    return roots;
  }
}

export class ReviewView extends BoardView {
  protected roots(): Item[] {
    const r = this.board?.review;
    if (!r) return [];
    const files = r.changedFiles.map(
      (f) =>
        new Item(f.path, {
          description: f.status,
          icon: f.status === "deleted" ? "diff-removed" : f.status === "untracked" || f.status === "added" ? "diff-added" : "diff-modified",
          command: { command: "aura.openDiff", title: "Open Diff", arguments: [f.path, f.status] },
        }),
    );
    return [
      new Item(r.passed ? "Evaluator approved" : "Not approved", {
        description: `${r.rounds} round${r.rounds === 1 ? "" : "s"}`,
        icon: r.passed ? "pass-filled" : "error",
        color: r.passed ? "testing.iconPassed" : "errorForeground",
        tooltip: r.summary,
      }),
      new Item("Changed files", { icon: "files", children: files }),
      new Item("Checks", { icon: "beaker", children: r.checks.map((c) => new Item(c.command, { icon: c.passed ? "pass" : "error", description: `exit ${c.exitCode}` })) }),
      new Item("Evaluator", {
        icon: "comment-discussion",
        tooltip: r.summary,
        description: r.summary.slice(0, 80),
        children: r.findings.map((f) => new Item(f.message, { description: [f.severity, f.file].filter(Boolean).join(" · "), icon: f.severity === "minor" ? "info" : "warning", tooltip: f.message })),
      }),
    ];
  }
}

// aura-git:/<path>?ref=HEAD → the file at the last commit (empty for a new file), for the diff editor.
export class GitShowProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly root: () => string | null) {}

  provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const root = this.root();
    const ref = new URLSearchParams(uri.query).get("ref") || "HEAD";
    const path = uri.path.replace(/^\//, "");
    if (!root || !/^[\w./-]+$/.test(ref)) return Promise.resolve("");
    return new Promise((resolve) => execFile("git", ["show", `${ref}:${path}`], { cwd: root, maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => resolve(error ? "" : stdout)));
  }
}

export async function openDiff(root: vscode.Uri, path: string, status: string): Promise<void> {
  const before = vscode.Uri.from({ scheme: GIT_SCHEME, path: `/${path}`, query: "ref=HEAD" });
  const after = vscode.Uri.joinPath(root, path);
  if (status === "deleted") return void (await vscode.window.showTextDocument(before));
  await vscode.commands.executeCommand("vscode.diff", before, after, `${path} (last commit ↔ AURA's change)`);
}
