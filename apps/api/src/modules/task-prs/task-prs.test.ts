import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyCiReport } from "./ci-report.js";
import { GITHUB_OIDC_ISSUER, verifyGithubOidc } from "./oidc.js";
import { ciReportSchema, recordPrSchema } from "./task-prs.schemas.js";
import { taskFromBranch, type TaskPrView } from "./task-prs.types.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = async () => ({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1" }] });
const now = Date.UTC(2026, 9, 2, 12) ;

function jwt(claims: Record<string, unknown>, kid = "k1", key = privateKey): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${enc({ alg: "RS256", kid })}.${enc(claims)}`;
  return `${head}.${sign("RSA-SHA256", Buffer.from(head), key).toString("base64url")}`;
}

const good = { iss: GITHUB_OIDC_ISSUER, aud: "aura", exp: now / 1000 + 300, nbf: now / 1000 - 10, repository: "acme/tickets", sha: "abc1234", ref: "refs/pull/7/merge", event_name: "pull_request", run_id: "99" };
const verifyAt = (token: string) => verifyGithubOidc(token, { audience: "aura", jwks, now: () => now });

describe("CI report authentication (GitHub Actions OIDC)", () => {
  it("accepts a GitHub-signed token for AURA and trusts its repository", async () => {
    expect(await verifyAt(jwt(good))).toMatchObject({ repository: "acme/tickets", sha: "abc1234", event_name: "pull_request" });
  });

  it("refuses a forged, foreign, expired or wrong-audience token", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    await expect(verifyAt(jwt(good, "k1", other))).rejects.toThrow(/signature/);
    await expect(verifyAt(jwt(good, "k9"))).rejects.toThrow(/key/);
    await expect(verifyAt(jwt({ ...good, iss: "https://evil.example" }))).rejects.toThrow(/GitHub/);
    await expect(verifyAt(jwt({ ...good, aud: "someone-else" }))).rejects.toThrow(/audience/);
    await expect(verifyAt(jwt({ ...good, exp: now / 1000 - 3600 }))).rejects.toThrow(/expired/);
    await expect(verifyAt(jwt({ ...good, repository: undefined }))).rejects.toThrow(/repository/);
    await expect(verifyAt("not.a.jwt")).rejects.toThrow();
  });
});

describe("Task PRs and CI", () => {
  it("reads the Task from its branch", () => {
    expect(taskFromBranch("feat/KAN-36/KAN-45")).toEqual({ taskKey: "KAN-45", epicKey: "KAN-36" });
    expect(taskFromBranch("feat/KAN-45")).toEqual({ taskKey: "KAN-45", epicKey: null });
    expect(taskFromBranch("feat/KAN-36/KAN-45_s1")).toBeNull();
    expect(taskFromBranch("main")).toBeNull();
  });

  it("validates what the runtime records and what CI reports", () => {
    expect(recordPrSchema.parse({ taskKey: "KAN-45", branch: "feat/KAN-36/KAN-45", baseSha: "abc1234", title: "KAN-45: list", reviewers: ["octocat", "acme/qa-team"] })).toMatchObject({ prNumber: null, repo: null });
    expect(() => recordPrSchema.parse({ taskKey: "KAN-45", branch: "feat/x; rm -rf /", baseSha: "abc1234", title: "x" })).toThrow();
    expect(() => ciReportSchema.parse({ status: "completed", branch: "feat/KAN-45", runUrl: "https://evil.example/run" })).toThrow();
  });

  const existing: TaskPrView = { taskKey: "KAN-45", epicKey: "KAN-36", repo: "acme/tickets", branch: "feat/KAN-36/KAN-45", prNumber: 7, prUrl: "https://github.com/acme/tickets/pull/7", prTitle: "x", prState: "open", reviewers: [], headSha: "abc1234", mergedAt: null, mergeSha: null, ciState: "running", ciUrl: null, ciSummary: {}, ciUpdatedAt: null, qaState: null, qaSummary: null, qaUpdatedAt: null, openedBy: "u1", runId: null, updatedAt: "" };

  it("notifies once when CI finishes, not while it runs or when the same result is re-sent", () => {
    const failed = ciReportSchema.parse({ status: "completed", conclusion: "failure", branch: existing.branch, headSha: "abc1234", jobs: [{ name: "frontend", result: "failure" }] });
    expect(applyCiReport(existing, failed, "acme/tickets")).toMatchObject({ notify: "ci_failed", patch: { ci_state: "failure", ci_summary: { jobs: [{ name: "frontend", result: "failure" }] } } });
    expect(applyCiReport({ ...existing, ciState: "failure" }, failed, "acme/tickets").notify).toBeNull();
    expect(applyCiReport({ ...existing, ciState: "failure", headSha: "def5678" }, { ...failed, headSha: "abc1234" }, "acme/tickets").notify).toBe("ci_failed");
    expect(applyCiReport(existing, ciReportSchema.parse({ status: "in_progress", branch: existing.branch }), "acme/tickets")).toMatchObject({ notify: null, patch: { ci_state: "running" } });
    expect(applyCiReport(existing, ciReportSchema.parse({ status: "completed", conclusion: "success", branch: existing.branch, headSha: "fff0000" }), "acme/tickets").notify).toBe("ci_passed");
  });

  it("fills in the PR from CI when AURA could not open it", () => {
    const { patch } = applyCiReport({ ...existing, prNumber: null, prUrl: null }, ciReportSchema.parse({ status: "in_progress", branch: existing.branch, prNumber: 12 }), "acme/tickets");
    expect(patch).toMatchObject({ pr_number: 12, pr_url: "https://github.com/acme/tickets/pull/12", pr_state: "open" });
  });
});
