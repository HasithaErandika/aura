import { describe, expect, it } from "vitest";
import { applyTaskEvent, prEventFrom, type TaskBoard } from "./task-board.js";
import { ciWorkflow, QA_RESULTS_PY } from "./project-setup.js";

const plan = { kind: "plan", taskKey: "KAN-45", coder: "frontend-react", route: "Frontend Task", branch: "feat/KAN-36/KAN-45", plan: { summary: "x", steps: [], checks: [], risks: [] } };

describe("PR view (Gate 6)", () => {
  it("follows the pull request from draft to open to CI result", () => {
    let board: TaskBoard | null = applyTaskEvent(null, plan);
    board = applyTaskEvent(board, { kind: "accepted" });
    board = applyTaskEvent(board, { kind: "pr-draft", draftId: "PR-1", title: "KAN-45: List tickets", branch: "feat/KAN-36/KAN-45", base: "development", reviewers: ["octocat"] });
    expect(board).toMatchObject({ status: "pr-review", pr: { title: "KAN-45: List tickets", reviewers: ["octocat"], url: null } });
    board = applyTaskEvent(board, { kind: "pr-step", step: "push" });
    expect(board!.pr!.step).toBe("push");
    board = applyTaskEvent(board, { kind: "pr", url: "https://github.com/acme/tickets/pull/12", number: 12, branch: "feat/KAN-36/KAN-45", reviewers: ["octocat"], ciState: "pending" });
    expect(board).toMatchObject({ status: "pr-open", pr: { number: 12, step: null, ciState: "pending", title: "KAN-45: List tickets" } });
    board = applyTaskEvent(
      board,
      prEventFrom({ prUrl: "https://github.com/acme/tickets/pull/12", prNumber: 12, branch: "feat/KAN-36/KAN-45", reviewers: ["octocat"], ciState: "failure", ciUrl: "https://github.com/acme/tickets/actions/runs/1", ciSummary: { jobs: [{ name: "frontend", result: "failure" }], tests: { passed: 3, failed: 1, skipped: 0 } } }),
    );
    expect(board!.pr).toMatchObject({ ciState: "failure", jobs: [{ name: "frontend", result: "failure" }], tests: { failed: 1 } });
  });
});

describe("aura-ci.yml reports the AURA QA check", () => {
  it("keeps each app's JUnit report and posts AURA's verdict as the AURA QA status", () => {
    const yaml = ciWorkflow(["frontend"]);
    expect(yaml).toContain("name: junit-frontend\n          path: frontend/reports/junit*.xml");
    expect(yaml).toContain("pattern: junit-*");
    expect(yaml).toContain("statuses: write");
    expect(yaml).toContain('context: "AURA QA"');
    expect(yaml).toContain("scenarios: $scenarios");
    expect(QA_RESULTS_PY).toContain(String.raw`\[qa:([a-z0-9][a-z0-9._-]{0,119})\]`);
  });
});

describe("aura-ci.yml checks the API contract", () => {
  it("lints contracts/openapi.yaml and fails a PR that breaks the base branch's contract", () => {
    const yaml = ciWorkflow(["backend"]);
    expect(yaml).toContain("  contract:\n    runs-on: ubuntu-latest");
    expect(yaml).toContain("npx --yes @redocly/cli@1 lint contracts/openapi.yaml");
    expect(yaml).toContain('git show "origin/${{ github.base_ref }}:contracts/openapi.yaml"');
    expect(yaml).toContain("tufin/oasdiff breaking /base/base-openapi.yaml /head/openapi.yaml --fail-on ERR");
    expect(yaml).toContain('if [ ! -f contracts/openapi.yaml ]; then echo "No API contract"; exit 0; fi');
  });
});

describe("aura-ci.yml reports to AURA", () => {
  it("adds start and report jobs that prove the repository with GitHub OIDC", () => {
    const yaml = ciWorkflow(["frontend", "backend"]);
    expect(yaml).toContain("  aura-report:\n    needs: [frontend, backend, contract]");
    expect(yaml).toContain("id-token: write");
    expect(yaml).toContain("audience=aura");
    expect(yaml).toContain('"$AURA_API_URL/ci/report"');
    expect(yaml).toContain("AURA_API_URL: ${{ vars.AURA_API_URL }}");
    expect(yaml).not.toMatch(/secrets\./);
  });
});
