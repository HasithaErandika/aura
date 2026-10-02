import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { STACKS, branchProtection, codeowners, parseGitRemote, requiredChecks, type Stack } from "./project-setup.js";

const run = promisify(execFile);

// Runs `gh api` with a JSON body on stdin; the developer's own gh login does the work.
function ghApi(args: string[], body: unknown, cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("gh", ["api", ...args, "--input", "-"], { cwd });
    let output = "";
    child.stdout.on("data", (d) => (output += String(d)));
    child.stderr.on("data", (d) => (output += String(d)));
    child.on("error", (error) => resolve({ code: 1, output: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
    child.stdin.end(JSON.stringify(body));
  });
}

async function exists(root: vscode.Uri, path: string): Promise<boolean> {
  return vscode.workspace.fs.stat(vscode.Uri.joinPath(root, path)).then(() => true, () => false);
}

// AURA: Protect Branches (step 3.9): protects main and development on GitHub and adds CODEOWNERS.
export async function protectBranches(log: (line: string) => void): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return void vscode.window.showErrorMessage("AURA: open the project's folder first.");
  const cwd = folder.uri.fsPath;
  const remote = parseGitRemote((await run("git", ["remote", "get-url", "origin"], { cwd }).catch(() => ({ stdout: "" }))).stdout);
  if (!remote || remote.host !== "github.com") return void vscode.window.showErrorMessage("AURA: this folder has no GitHub remote named origin. Push it to GitHub first.");
  const login = (await run("gh", ["api", "user", "--jq", ".login"], { cwd }).catch(() => ({ stdout: "" }))).stdout.trim();
  if (!login) return void vscode.window.showErrorMessage("AURA: the GitHub CLI is not signed in. Run gh auth login, then try again.");

  const present: Stack[] = [];
  for (const s of Object.keys(STACKS) as Stack[]) if (await exists(folder.uri, STACKS[s].folder)) present.push(s);
  const qa = await vscode.window.showQuickPick(
    [
      { label: "Require AURA QA too", detail: "Only once the repository variable AURA_API_URL is set, or no pull request can merge.", value: true },
      { label: "CI and contract only", detail: "Add AURA QA later by running this again.", value: false },
    ],
    { title: `AURA: protect main and development of ${remote.owner}/${remote.name}` },
  );
  if (!qa) return;
  const checks = requiredChecks(present, qa.value);

  if (!(await exists(folder.uri, ".github/CODEOWNERS"))) {
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder.uri, ".github", "CODEOWNERS"), Buffer.from(codeowners([login]), "utf8"));
    log(`Wrote .github/CODEOWNERS (@${login}). Commit it so code-owner review applies.`);
  }
  const failed: string[] = [];
  for (const branch of ["main", "development"]) {
    const result = await ghApi(["-X", "PUT", `repos/${remote.owner}/${remote.name}/branches/${branch}/protection`], branchProtection(checks), cwd);
    if (result.code === 0) log(`✓ Protected ${branch}: reviewed PRs only, required checks ${checks.join(", ")}.`);
    else {
      failed.push(branch);
      log(`✗ ${branch}: ${result.output.trim().slice(0, 300)}`);
    }
  }
  if (failed.length) {
    void vscode.window.showWarningMessage(`AURA: could not protect ${failed.join(" and ")}. You need admin rights on the repository, and private repositories need a GitHub plan with branch protection. See the AURA output.`);
  } else {
    void vscode.window.showInformationMessage(`AURA: main and development are protected (${checks.join(", ")}).`);
  }
}
