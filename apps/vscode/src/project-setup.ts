// Pure helpers for connecting a folder to an AURA project and initialising a new one (plan §9).
// No VS Code API here, so they are tested directly; project.ts runs them.

export interface ProjectConfig {
  projectId: string;
  projectKey: string;
  jiraProjectKey: string;
}

export const PROJECT_FILE = ".aura/project.json";

// What a GitHub (or any host) remote URL points at.
export function parseGitRemote(url: string): { host: string; owner: string; name: string } | null {
  const trimmed = url.trim();
  const ssh = /^(?:ssh:\/\/)?git@([^:/]+)[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(trimmed);
  if (ssh) return { host: ssh[1]!, owner: ssh[2]!, name: ssh[3]! };
  const https = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(trimmed);
  if (https) return { host: https[1]!, owner: https[2]!, name: https[3]! };
  return null;
}

// Whether this folder's remote is the repository registered for the project.
export function remoteMatches(remote: { owner: string; name: string } | null, registered: { owner: string; name: string } | null): boolean | null {
  if (!remote || !registered) return null;
  return remote.owner.toLowerCase() === registered.owner.toLowerCase() && remote.name.toLowerCase() === registered.name.toLowerCase();
}

const AURA_IGNORES = [".aura/worktrees/", ".aura/council/", ".aura/settings.local.json"];

// .gitignore with AURA's local folders added once.
export function withAuraIgnores(gitignore: string): string {
  const lines = gitignore.split(/\r?\n/);
  const missing = AURA_IGNORES.filter((entry) => !lines.includes(entry));
  if (!missing.length) return gitignore;
  const base = gitignore.length && !gitignore.endsWith("\n") ? `${gitignore}\n` : gitignore;
  return `${base}${base ? "\n" : ""}# AURA (local agent work, never committed)\n${missing.join("\n")}\n`;
}

export type Stack = "frontend" | "backend";

export const STACKS: Record<Stack, { label: string; folder: string; scaffold: string }> = {
  frontend: { label: "Frontend: React + Vite (TypeScript)", folder: "frontend", scaffold: "npm create vite@latest frontend -- --template react-ts && cd frontend && npm install" },
  backend: { label: "Backend: NestJS", folder: "backend", scaffold: "npx --yes @nestjs/cli@latest new backend --package-manager npm --skip-git" },
};

// The CI workflow every AURA project starts with: each app installs and runs its own checks.
// CI on the pull request is the authoritative test result (ADR-4 D6).
export function ciWorkflow(stacks: Stack[]): string {
  const jobs = stacks
    .map((s) => {
      const dir = STACKS[s].folder;
      return `  ${dir}:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ${dir}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: ${dir}/package-lock.json
      - run: npm ci
      - run: npm run lint --if-present
      - run: npx tsc --noEmit
      - run: npm test --if-present -- --passWithNoTests
      - run: npm run build --if-present`;
    })
    .join("\n\n");
  return `# AURA CI: runs on every pull request to development and main. Its result is the evidence
# AURA and QA rely on (ADR-4).
name: aura-ci

on:
  pull_request:
    branches: [development, main]
  push:
    branches: [development, main]

jobs:
${jobs}
`;
}

// The project memory every agent reads first (like CLAUDE.md), filled in by the team over time.
export function auraMemory(project: ProjectConfig, stacks: Stack[]): string {
  return `# ${project.projectKey}

Project memory for AURA's agents. Keep it short: conventions, commands, things an agent must know.

## Layout
${stacks.map((s) => `- \`${STACKS[s].folder}/\`: ${STACKS[s].label}`).join("\n")}

## Commands
${stacks.map((s) => `- \`cd ${STACKS[s].folder} && npm test\`, \`npm run lint\`, \`npm run build\``).join("\n")}

## Branches
- \`main\`: releases only. \`development\`: integration; every Task opens a pull request into it.
- Task branches: \`feat/<EPIC>/<TASK>\`, parallel parts \`feat/<EPIC>/<TASK>_s1\`.
`;
}

// The project's starting .aura/settings.json: each app's checks run without asking, lint before
// every commit, secrets never read.
export function defaultSettings(stacks: Stack[]): string {
  const dirs = stacks.map((s) => STACKS[s].folder);
  return `${JSON.stringify(
    {
      defaultMode: "default",
      permissions: { allow: [], ask: ["Edit(package.json)", "Edit(.github/**)"], deny: ["Read(**/.env)", "Read(**/.env.local)", "Read(**/.env.*.local)"] },
      hooks: { afterEdit: [], beforeCommit: dirs.map((d) => `cd ${d} && npm run lint --if-present`) },
    },
    null,
    2,
  )}\n`;
}
