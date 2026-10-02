import * as vscode from "vscode";
import type { JiraIssueSummary } from "@aura/client";
import type { Session } from "./session.js";

// The Tasks view: Epics from Jira, each with its Stories and Tasks. "Start Work" on a Task opens
// the chat for it. Tasks hang off the Epic in Jira today (no Story link yet - plan V3), so they
// are shown in their own group under the Epic.

export type TaskNode =
  | { kind: "epic"; issue: JiraIssueSummary }
  | { kind: "group"; epicKey: string; label: string; issues: JiraIssueSummary[]; itemKind: "story" | "task" | "bug" }
  | { kind: "issue"; issue: JiraIssueSummary; itemKind: "story" | "task" | "bug"; epicKey: string }
  | { kind: "message"; text: string };

function statusIcon(issue: JiraIssueSummary): vscode.ThemeIcon {
  if (issue.statusCategory === "done") return new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"));
  if (issue.statusCategory === "indeterminate") return new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("charts.blue"));
  return new vscode.ThemeIcon("circle-outline");
}

export class TasksProvider implements vscode.TreeDataProvider<TaskNode> {
  private readonly changed = new vscode.EventEmitter<TaskNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly session: Session) {
    session.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.changed.fire(undefined);
  }

  getTreeItem(node: TaskNode): vscode.TreeItem {
    switch (node.kind) {
      case "epic": {
        const item = new vscode.TreeItem(`${node.issue.key}  ${node.issue.summary}`, vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = new vscode.ThemeIcon("milestone");
        item.description = node.issue.status;
        item.contextValue = "epic";
        return item;
      }
      case "group": {
        const item = new vscode.TreeItem(`${node.label} (${node.issues.length})`, node.issues.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon(node.itemKind === "story" ? "book" : node.itemKind === "bug" ? "bug" : "checklist");
        return item;
      }
      case "issue": {
        const item = new vscode.TreeItem(`${node.issue.key}  ${node.issue.summary}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = statusIcon(node.issue);
        item.description = node.issue.status;
        item.tooltip = `${node.issue.key} · ${node.issue.issueType} · ${node.issue.status}${node.issue.assignee ? ` · ${node.issue.assignee}` : ""}\n${node.issue.summary}`;
        item.contextValue = node.itemKind;
        if (node.itemKind === "task" || node.itemKind === "bug") item.command = { command: "aura.startTask", title: "Start Work on Task", arguments: [node] };
        return item;
      }
      case "message":
        return new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
    }
  }

  async getChildren(node?: TaskNode): Promise<TaskNode[]> {
    if (!(await this.session.token())) return [];
    try {
      if (!node) {
        const epics = await this.session.client().jira.epics();
        return epics.length ? epics.map((issue) => ({ kind: "epic", issue })) : [{ kind: "message", text: "No Epics yet." }];
      }
      if (node.kind === "epic") {
        const detail = await this.session.client().jira.epic(node.issue.key);
        const groups: TaskNode[] = [
          { kind: "group", epicKey: node.issue.key, label: "Stories", issues: detail.stories, itemKind: "story" },
          { kind: "group", epicKey: node.issue.key, label: "Tasks", issues: detail.tasks, itemKind: "task" },
        ];
        if (detail.bugs.length) groups.push({ kind: "group", epicKey: node.issue.key, label: "Bugs", issues: detail.bugs, itemKind: "bug" });
        return groups;
      }
      if (node.kind === "group") return node.issues.map((issue) => ({ kind: "issue", issue, itemKind: node.itemKind, epicKey: node.epicKey }));
      return [];
    } catch (error) {
      return [{ kind: "message", text: `Could not load: ${error instanceof Error ? error.message : String(error)}` }];
    }
  }
}
