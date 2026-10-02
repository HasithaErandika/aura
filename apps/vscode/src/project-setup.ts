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

const AURA_IGNORES = [".aura/worktrees/", ".aura/settings.local.json"];

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
      - name: Keep the test report for AURA QA
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: junit-${dir}
          path: ${dir}/reports/junit*.xml
          if-no-files-found: ignore
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

${CONTRACT_JOB}

${auraReportJobs([...stacks.map((st) => STACKS[st].folder), "contract"])}`;
}

// The Epic's API contract (contracts/openapi.yaml, committed at Gate 6): it must lint, and a pull
// request must not break the contract already on its base branch. Skipped when there is none.
export const CONTRACT_JOB = `  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Lint the API contract
        run: |
          if [ ! -f contracts/openapi.yaml ]; then echo "No API contract"; exit 0; fi
          npx --yes @redocly/cli@1 lint contracts/openapi.yaml
      - name: No breaking changes against the base branch
        if: github.event_name == 'pull_request'
        run: |
          if [ ! -f contracts/openapi.yaml ]; then exit 0; fi
          if ! git show "origin/\${{ github.base_ref }}:contracts/openapi.yaml" > /tmp/base-openapi.yaml 2>/dev/null; then echo "New contract"; exit 0; fi
          docker run --rm -v /tmp:/base -v "$PWD/contracts:/head" tufin/oasdiff breaking /base/base-openapi.yaml /head/openapi.yaml --fail-on ERR`;

// Reads every JUnit report CI kept and returns each QA scenario's result, from tests named
// [qa:<scenario file name>] (roadmap step 3.7).
export const QA_RESULTS_PY = String.raw`import glob, json, re, xml.etree.ElementTree as ET
out = []
for f in glob.glob("junit/**/*.xml", recursive=True):
    try:
        root = ET.parse(f).getroot()
    except Exception:
        continue
    for tc in root.iter("testcase"):
        name = (tc.get("name") or "") + " " + (tc.get("classname") or "")
        for m in re.finditer(r"\[qa:([a-z0-9][a-z0-9._-]{0,119})\]", name):
            failed = tc.find("failure") is not None or tc.find("error") is not None
            result = "failed" if failed else "skipped" if tc.find("skipped") is not None else "passed"
            out.append({"id": m.group(1), "result": result})
print(json.dumps(out[:500]))`;

const indent = (text: string, spaces: number) => text.split("\n").map((l) => (l ? " ".repeat(spaces) + l : l)).join("\n");

// Reports each pull request's CI run to AURA (POST /ci/report), so QA sees it and is notified
// (V6), and posts AURA's QA verdict as the "AURA QA" commit status (3.7). GitHub Actions OIDC
// proves the repository: no secret is stored. Set the repository variable AURA_API_URL to turn
// it on; without it these jobs are skipped.
export function auraReportJobs(needs: string[]): string {
  const env = `        env:
          AURA_API_URL: \${{ vars.AURA_API_URL }}
          BRANCH: \${{ github.head_ref }}
          SHA: \${{ github.event.pull_request.head.sha }}
          PR: \${{ github.event.pull_request.number }}
          RUN_URL: \${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}
          GH_TOKEN: \${{ github.token }}
          REPO: \${{ github.repository }}`;
  const token = `TOKEN=$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=aura" | jq -r .value)`;
  const post = (body: string) => `RESP=$(curl -sS -X POST "$AURA_API_URL/ci/report" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$(${body})") || RESP='{}'`;
  const status = `STATE=$(echo "$RESP" | jq -r '.qa.state // empty' 2>/dev/null)
          DESC=$(echo "$RESP" | jq -r '.qa.description // ""' 2>/dev/null)
          if [ -n "$STATE" ]; then
            curl -sS -X POST "https://api.github.com/repos/$REPO/statuses/$SHA" -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \\
              -d "$(jq -n --arg s "$STATE" --arg d "$DESC" --arg u "$RUN_URL" '{state: $s, context: "AURA QA", description: ($d | .[0:140]), target_url: $u}')" > /dev/null
          else
            echo "AURA did not accept the report"
          fi`;
  return `  # AURA: tells QA that CI started on this pull request; AURA QA is pending until it ends.
  aura-start:
    if: github.event_name == 'pull_request' && vars.AURA_API_URL != ''
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      statuses: write
    steps:
      - name: Report to AURA
${env}
        run: |
          ${token}
          ${post(`jq -n --arg branch "$BRANCH" --arg sha "$SHA" --argjson pr "$PR" --arg url "$RUN_URL" '{status: "in_progress", branch: $branch, headSha: $sha, prNumber: $pr, runUrl: $url}'`)}
          ${status}

  # AURA: the result of every job above and of each QA scenario's tests, for QA and the
  # developer's PR view; AURA's verdict becomes the "AURA QA" status on the pull request.
  aura-report:
    needs: [${needs.join(", ")}]
    if: always() && github.event_name == 'pull_request' && vars.AURA_API_URL != ''
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      statuses: write
    steps:
      - uses: actions/download-artifact@v4
        continue-on-error: true
        with:
          pattern: junit-*
          path: junit
      - name: Report to AURA
${env}
          RESULTS: \${{ toJSON(needs) }}
        run: |
          JOBS=$(echo "$RESULTS" | jq -c '[to_entries[] | {name: .key, result: .value.result}]')
          CONCLUSION=$(echo "$JOBS" | jq -r 'if any(.[]; .result == "failure") then "failure" elif any(.[]; .result == "cancelled") then "cancelled" else "success" end')
          SCENARIOS=$(python3 - <<'PY'
${indent(QA_RESULTS_PY, 10)}
          PY
          )
          ${token}
          ${post(`jq -n --arg branch "$BRANCH" --arg sha "$SHA" --argjson pr "$PR" --arg url "$RUN_URL" --arg conclusion "$CONCLUSION" --argjson jobs "$JOBS" --argjson scenarios "$SCENARIOS" '{status: "completed", conclusion: $conclusion, branch: $branch, headSha: $sha, prNumber: $pr, runUrl: $url, jobs: $jobs, scenarios: $scenarios}'`)}
          ${status}
`;
}

// Repository defaults (roadmap step 3.9): main and development take changes only through a
// reviewed pull request whose checks passed. The checks are the CI jobs by name, the contract job,
// and, once AURA reports to the repository, the AURA QA status.
export function requiredChecks(stacks: Stack[], auraQa: boolean): string[] {
  return [...stacks.map((s) => STACKS[s].folder), "contract", ...(auraQa ? ["AURA QA"] : [])];
}

export function branchProtection(checks: string[]): Record<string, unknown> {
  return {
    required_status_checks: { strict: true, contexts: checks },
    enforce_admins: false,
    required_pull_request_reviews: { required_approving_review_count: 1, require_code_owner_reviews: true, dismiss_stale_reviews: true },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
  };
}

const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\/[A-Za-z0-9_.-]+)?$/;

// Who must review: the owners given, else a template the team fills in.
export function codeowners(owners: string[]): string {
  const valid = owners.filter((o) => GITHUB_HANDLE.test(o));
  const header = "# Code owners review every pull request into main and development (AURA, branch protection).\n# One line per path: <pattern> @user or @org/team. The last matching line wins.\n";
  return valid.length ? `${header}* ${valid.map((o) => `@${o}`).join(" ")}\n` : `${header}# * @your-github-user\n`;
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
