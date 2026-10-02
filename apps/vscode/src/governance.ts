import * as vscode from "vscode";
import { MODES, MODE_LABELS, type Mode, type PermissionPolicy } from "./permissions.js";
import { withAuraIgnores } from "./project-setup.js";
import { EMPTY_SETTINGS, LOCAL_SETTINGS_FILE, SETTINGS_FILE, allowedModes, mergeSettings, parseSettings, withAllowRule, type Hooks, type ProjectSettings } from "./project-settings.js";
import type { Session } from "./session.js";

// The rules agents work under in this folder (plan §6): the permission mode, the project's
// .aura/settings.json and the developer's .aura/settings.local.json, and which modes the admin
// allows for the project (Admin → Settings → VS Code permission modes). Reloaded whenever a
// settings file changes.

const MODE_KEY = "aura.mode";

export class Governance {
  private settings: ProjectSettings = EMPTY_SETTINGS;
  private allowed: Mode[] = [...MODES];
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly session: Session,
    private readonly policy: PermissionPolicy,
    private readonly log: (line: string) => void,
  ) {}

  get mode(): Mode {
    return this.policy.mode;
  }

  get hooks(): Hooks {
    return this.settings.hooks;
  }

  get allowedModes(): Mode[] {
    return this.allowed;
  }

  watch(): vscode.Disposable {
    const folder = this.session.folder;
    if (!folder) return new vscode.Disposable(() => undefined);
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, ".aura/settings*.json"));
    const reload = () => void this.reload();
    watcher.onDidChange(reload);
    watcher.onDidCreate(reload);
    watcher.onDidDelete(reload);
    return watcher;
  }

  async reload(): Promise<void> {
    const folder = this.session.folder;
    const read = async (file: string) => (folder ? Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, file))).toString("utf8") : null);
    const [shared, local] = await Promise.all([read(SETTINGS_FILE).catch(() => null), read(LOCAL_SETTINGS_FILE).catch(() => null)]);
    this.settings = mergeSettings(parseSettings(shared, SETTINGS_FILE), parseSettings(local, LOCAL_SETTINGS_FILE));
    for (const problem of this.settings.problems) this.log(`⚠ ${problem}`);
    for (const rule of this.policy.setRules(this.settings.permissions)) this.log(`⚠ Ignored rule ${rule}: write Bash(command), Bash(command:*), Edit(glob) or Read(glob)`);

    try {
      if (await this.session.token()) {
        const effective = await this.session.client().settings.effective(this.session.project?.projectId);
        this.allowed = allowedModes(effective["governance.vscodeModes"]?.value);
      }
    } catch {
      // Offline: keep the last known modes.
    }
    this.apply(this.context.workspaceState.get<Mode>(MODE_KEY) ?? this.settings.defaultMode ?? "default");
  }

  // The requested mode, or the closest one the project allows (never a more permissive one).
  private apply(requested: Mode): void {
    const order: Mode[] = ["plan", "default", "acceptEdits"];
    let mode = requested;
    while (!this.allowed.includes(mode)) mode = order[Math.max(0, order.indexOf(mode) - 1)]!;
    if (mode !== requested) this.log(`The project allows only: ${this.allowed.map((m) => MODE_LABELS[m]).join(", ")}. Using ${MODE_LABELS[mode]}.`);
    this.policy.mode = mode;
    void vscode.commands.executeCommand("setContext", "aura.mode", mode);
    this.changed.fire();
  }

  async pickMode(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      this.allowed.map((m) => ({ label: MODE_LABELS[m], description: m === this.mode ? "current" : undefined, mode: m })),
      { title: "AURA: permission mode for this folder" },
    );
    if (!picked) return;
    await this.context.workspaceState.update(MODE_KEY, picked.mode);
    this.apply(picked.mode);
    this.log(`Mode: ${MODE_LABELS[picked.mode]}.`);
  }

  // "Allow for this project": a rule in the developer's own settings file, which git ignores.
  async allowForProject(rule: string): Promise<void> {
    const folder = this.session.folder;
    if (!folder) return;
    const file = vscode.Uri.joinPath(folder.uri, LOCAL_SETTINGS_FILE);
    const current = await vscode.workspace.fs.readFile(file).then((b) => Buffer.from(b).toString("utf8"), () => null);
    await vscode.workspace.fs.writeFile(file, Buffer.from(withAllowRule(current, rule), "utf8"));
    const ignore = vscode.Uri.joinPath(folder.uri, ".gitignore");
    const gitignore = await vscode.workspace.fs.readFile(ignore).then((b) => Buffer.from(b).toString("utf8"), () => "");
    const next = withAuraIgnores(gitignore);
    if (next !== gitignore) await vscode.workspace.fs.writeFile(ignore, Buffer.from(next, "utf8"));
    this.log(`Saved ${rule} to ${LOCAL_SETTINGS_FILE}.`);
    await this.reload();
  }
}
