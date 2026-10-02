import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import type { Project } from "@aura/client";
import { PROJECT_FILE, STACKS, auraMemory, ciWorkflow, parseGitRemote, remoteMatches, withAuraIgnores, type ProjectConfig, type Stack } from "./project-setup.js";
import type { Session } from "./session.js";

// Connect this folder to an AURA project, or create a new project here (plan §9). Everything runs
// on the developer's machine, in front of them: scaffold and git commands run as VS Code tasks in
// the terminal. Registering a project and its repository stays an admin action in the web app.

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

// Runs a shell command as a visible VS Code task and resolves with its exit code.
function runTask(label: string, command: string, cwd: string): Promise<number> {
  const task = new vscode.Task({ type: "shell" }, vscode.TaskScope.Workspace, label, "AURA", new vscode.ShellExecution(command, { cwd }));
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: false };
  return new Promise((resolve, reject) => {
    const done = vscode.tasks.onDidEndTaskProcess((e) => {
      if (e.execution.task === task) {
        done.dispose();
        resolve(e.exitCode ?? 1);
      }
    });
    vscode.tasks.executeTask(task).then(undefined, (error) => {
      done.dispose();
      reject(error);
    });
  });
}

async function writeText(folder: vscode.Uri, relative: string, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder, relative), Buffer.from(text, "utf8"));
}

async function readText(folder: vscode.Uri, relative: string): Promise<string> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, relative))).toString("utf8");
  } catch {
    return "";
  }
}

async function pickProject(session: Session): Promise<Project | undefined> {
  const projects = await session.client().projects.list();
  if (!projects.length) {
    void vscode.window.showWarningMessage("AURA: no projects exist yet. An admin creates them in the web app (Admin → Projects & Repositories).");
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    projects.map((p) => ({ label: p.key, description: p.name, detail: p.repository ? `Repository: ${p.repository.fullName}` : "No repository registered yet", project: p })),
    { title: "AURA: which project is this folder?" },
  );
  return picked?.project;
}

async function writeProjectFiles(folder: vscode.Uri, config: ProjectConfig): Promise<void> {
  await writeText(folder, PROJECT_FILE, `${JSON.stringify(config, null, 2)}\n`);
  await writeText(folder, ".gitignore", withAuraIgnores(await readText(folder, ".gitignore")));
}

function configOf(project: Project): ProjectConfig {
  return { projectId: project.id, projectKey: project.key, jiraProjectKey: project.jiraProjectKey };
}

export async function connectRepository(session: Session): Promise<void> {
  const folder = session.folder;
  if (!folder) return void vscode.window.showErrorMessage("AURA: open the repository folder first.");
  let remote: ReturnType<typeof parseGitRemote> = null;
  try {
    await git(folder.uri.fsPath, ["rev-parse", "--is-inside-work-tree"]);
    remote = parseGitRemote(await git(folder.uri.fsPath, ["remote", "get-url", "origin"]).catch(() => ""));
  } catch {
    const choice = await vscode.window.showWarningMessage("AURA: this folder isn't a git repository.", "Initialize Project Here", "Cancel");
    if (choice === "Initialize Project Here") await initializeProject(session);
    return;
  }

  const project = await pickProject(session);
  if (!project) return;
  const match = remoteMatches(remote, project.repository);
  if (match === false) {
    const go = await vscode.window.showWarningMessage(
      `AURA: this folder's origin is ${remote!.owner}/${remote!.name}, but ${project.key}'s registered repository is ${project.repository!.fullName}.`,
      { modal: true },
      "Connect Anyway",
    );
    if (go !== "Connect Anyway") return;
  }
  await writeProjectFiles(folder.uri, configOf(project));
  await session.refresh();
  const note = project.repository ? "" : " Ask an admin to register its repository (Admin → Projects & Repositories).";
  void vscode.window.showInformationMessage(`AURA: this folder is connected to ${project.key}. Commit .aura/project.json so your team shares it.${note}`);
}

export async function initializeProject(session: Session): Promise<void> {
  const folder = session.folder;
  if (!folder) return void vscode.window.showErrorMessage("AURA: open an empty folder first.");
  const entries = (await vscode.workspace.fs.readDirectory(folder.uri)).filter(([name]) => name !== ".aura" && name !== ".vscode");
  if (entries.length) return void vscode.window.showErrorMessage("AURA: Initialize Project needs an empty folder. For an existing repository use AURA: Connect Repository.");

  const project = await pickProject(session);
  if (!project) return;
  const picked = await vscode.window.showQuickPick(
    (Object.keys(STACKS) as Stack[]).map((s) => ({ label: STACKS[s].label, stack: s, picked: true })),
    { title: `AURA: what does ${project.key} contain? (one repository, one folder each)`, canPickMany: true },
  );
  const stacks = (picked ?? []).map((p) => p.stack);
  if (!stacks.length) return;
  const cwd = folder.uri.fsPath;

  for (const stack of stacks) {
    if ((await runTask(`AURA: scaffold ${STACKS[stack].folder}`, STACKS[stack].scaffold, cwd)) !== 0) {
      return void vscode.window.showErrorMessage(`AURA: the ${STACKS[stack].folder} scaffold failed. Check the terminal, fix it, then run Initialize Project again in an empty folder.`);
    }
  }

  const config = configOf(project);
  await writeProjectFiles(folder.uri, config);
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, ".github", "workflows"));
  await writeText(folder.uri, ".github/workflows/aura-ci.yml", ciWorkflow(stacks));
  await writeText(folder.uri, ".aura/AURA.md", auraMemory(config, stacks));

  const commit = `git init -b main && git add -A && git commit -m "chore: initialize ${project.key} with AURA" && git branch development`;
  if ((await runTask("AURA: git init", commit, cwd)) !== 0) {
    return void vscode.window.showErrorMessage("AURA: git init or the first commit failed (is your git user.name / user.email set?). Check the terminal.");
  }

  const remote = await vscode.window.showInputBox({
    title: "AURA: push to GitHub (optional)",
    prompt: project.repository ? `The registered repository is ${project.repository.fullName}. Paste its clone URL, or leave empty to push later.` : "Paste the empty GitHub repository's clone URL, or leave empty to push later.",
    ignoreFocusOut: true,
  });
  if (remote?.trim()) {
    const code = await runTask("AURA: push", `git remote add origin ${JSON.stringify(remote.trim())} && git push -u origin main development`, cwd);
    if (code !== 0) void vscode.window.showWarningMessage("AURA: the push failed. The project is ready locally; push main and development when the remote is ready.");
  }
  await session.refresh();
  void vscode.window.showInformationMessage(`AURA: ${project.key} is initialized: ${stacks.map((s) => STACKS[s].folder).join(" and ")}, main and development branches, CI and .aura/.`);
}
