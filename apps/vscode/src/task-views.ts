import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { STATUS_LABEL, type PartView, type PrView, type TaskBoard } from "./task-board.js";

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

function partIcon(p: PartView): { icon: string; color?: string } {
  if (p.merge === "failed" || p.passed === false) return { icon: "error", color: "errorForeground" };
  if (p.merge === "clean" || p.merge === "resolved") return { icon: "pass-filled", color: "testing.iconPassed" };
  if (p.passed) return { icon: "pass" };
  if (p.status === "planned" || p.status === "waiting") return { icon: "circle-outline" };
  return { icon: "sync~spin" };
}

function partItem(p: PartView): Item {
  const state = p.merge ? `merge ${p.merge}` : p.status;
  return new Item(`${p.n}. ${p.title}`, {
    ...partIcon(p),
    description: `${p.coder} · ${state}${p.rounds ? ` · ${p.rounds} round${p.rounds === 1 ? "" : "s"}` : ""}`,
    tooltip: `${p.branch}\nOwns: ${p.scope.join(", ")}`,
    children: [new Item(p.branch, { icon: "git-branch" }), ...p.scope.map((f) => new Item(f, { icon: "folder" }))],
  });
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
      ...(b.branch ? [new Item("Branch", { description: b.branch, icon: "git-branch" })] : []),
      new Item("Steps", { children: steps, icon: "list-ordered" }),
      ...(b.parts.length ? [new Item("Parallel parts", { icon: "split-horizontal", description: `${b.parts.length} coders`, children: b.parts.map(partItem) })] : []),
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
    const parts = this.board?.parts ?? [];
    const files = r.changedFiles.map(
      (f) =>
        new Item(f.path, {
          description: f.status,
          icon: f.status === "deleted" ? "diff-removed" : f.status === "untracked" || f.status === "added" ? "diff-added" : "diff-modified",
          command: { command: "aura.openDiff", title: "Open Diff", arguments: [f.path, f.status, r.baseRef] },
        }),
    );
    return [
      new Item(r.passed ? "Evaluator approved" : "Not approved", {
        description: `${r.rounds} round${r.rounds === 1 ? "" : "s"}`,
        icon: r.passed ? "pass-filled" : "error",
        color: r.passed ? "testing.iconPassed" : "errorForeground",
        tooltip: r.summary,
      }),
      ...(parts.length ? [new Item("Parallel parts", { icon: "split-horizontal", children: parts.map(partItem) })] : []),
      new Item("Changed files", { icon: "files", description: r.baseRef === "HEAD" ? undefined : `since ${r.baseRef.slice(0, 8)}`, children: files }),
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

const CI_LABEL: Record<string, { text: string; icon: string; color?: string }> = {
  pending: { text: "CI waiting to start", icon: "clock" },
  running: { text: "CI running", icon: "sync~spin" },
  success: { text: "CI passed", icon: "pass-filled", color: "testing.iconPassed" },
  failure: { text: "CI failed", icon: "error", color: "errorForeground" },
  cancelled: { text: "CI cancelled", icon: "circle-slash" },
};

const PR_STEP: Record<string, string> = { commit: "Committing the accepted change…", push: "Pushing the branch…", open: "Opening the pull request…" };

// Gate 6 (plan §4): the PR's title, branches and reviewers; after it opens, its link and the CI
// result AURA received from aura-ci.yml.
export class PullRequestView extends BoardView {
  protected roots(): Item[] {
    const pr: PrView | null | undefined = this.board?.pr;
    if (!pr) return [];
    const roots: Item[] = [
      new Item(pr.number ? `#${pr.number} ${pr.title}` : pr.title || "Pull request", {
        icon: "git-pull-request",
        description: pr.url ? "open on GitHub" : pr.step ? undefined : "waiting for your approval (Gate 6)",
        tooltip: pr.url ?? pr.title,
        ...(pr.url ? { command: { command: "vscode.open", title: "Open Pull Request", arguments: [vscode.Uri.parse(pr.url)] } } : {}),
      }),
      new Item("Branch", { icon: "git-branch", description: `${pr.branch} → ${pr.base}` }),
      new Item("Reviewers", { icon: "person", description: pr.reviewers.length ? pr.reviewers.join(", ") : "none" }),
    ];
    if (pr.step) roots.push(new Item(PR_STEP[pr.step] ?? pr.step, { icon: "sync~spin" }));
    if (pr.url) {
      const ci = CI_LABEL[pr.ciState ?? ""] ?? { text: "No CI result yet", icon: "circle-outline" };
      const jobs = pr.jobs.map((j) => new Item(j.name, { icon: j.result === "success" ? "pass" : j.result === "failure" ? "error" : "circle-outline", description: j.result }));
      if (pr.tests) jobs.push(new Item("Tests", { icon: "beaker", description: `${pr.tests.passed} passed, ${pr.tests.failed} failed, ${pr.tests.skipped} skipped` }));
      if (pr.prState === "merged") roots.push(new Item("Merged", { icon: "git-merge", description: "ready for release" }));
      if (pr.prState === "closed") roots.push(new Item("Closed without merging", { icon: "circle-slash" }));
      roots.push(new Item(ci.text, { icon: ci.icon, color: ci.color, children: jobs, ...(pr.ciUrl ? { command: { command: "vscode.open", title: "Open CI Run", arguments: [vscode.Uri.parse(pr.ciUrl)] }, tooltip: pr.ciUrl } : {}) }));
    }
    return roots;
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

// Before ↔ after for one changed file: `baseRef` is the commit the Task started from, so the diff
// also covers what parallel parts committed and merged.
export async function openDiff(root: vscode.Uri, path: string, status: string, baseRef = "HEAD"): Promise<void> {
  const ref = /^[\w./-]+$/.test(baseRef) ? baseRef : "HEAD";
  const before = vscode.Uri.from({ scheme: GIT_SCHEME, path: `/${path}`, query: `ref=${ref}` });
  const after = vscode.Uri.joinPath(root, path);
  if (status === "deleted") return void (await vscode.window.showTextDocument(before));
  await vscode.commands.executeCommand("vscode.diff", before, after, `${path} (${ref === "HEAD" ? "last commit" : "Task start"} ↔ AURA's change)`);
}
