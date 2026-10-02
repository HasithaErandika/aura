import { describe, expect, it } from "vitest";
import { branchProtection, codeowners, requiredChecks } from "./project-setup.js";

describe("repository defaults (branch protection)", () => {
  it("requires the CI job of each app, the contract job and, when asked, AURA QA", () => {
    expect(requiredChecks(["frontend", "backend"], false)).toEqual(["frontend", "backend", "contract"]);
    expect(requiredChecks(["backend"], true)).toEqual(["backend", "contract", "AURA QA"]);
  });

  it("allows changes only through a reviewed, up-to-date pull request with passing checks", () => {
    expect(branchProtection(["backend", "contract"])).toEqual({
      required_status_checks: { strict: true, contexts: ["backend", "contract"] },
      enforce_admins: false,
      required_pull_request_reviews: { required_approving_review_count: 1, require_code_owner_reviews: true, dismiss_stale_reviews: true },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false,
    });
  });

  it("names valid code owners and leaves a template otherwise", () => {
    expect(codeowners(["octocat", "acme/qa-team"])).toMatch(/\n\* @octocat @acme\/qa-team\n$/);
    expect(codeowners(["bad handle!", ""])).toMatch(/# \* @your-github-user\n$/);
  });
});
