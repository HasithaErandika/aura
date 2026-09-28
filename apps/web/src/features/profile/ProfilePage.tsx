import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { AccessTokensCard } from "./AccessTokensCard.tsx";
import { GitIdentityCard } from "./GitIdentityCard.tsx";

// Profile - the git identity AURA commits as when you approve a gate, and personal access tokens
// for the `aura` CLI (and later the VS Code extension). Coding itself needs nothing connected
// here: Gate 5 runs AURA's own agents on AURA-governed models - the external Claude Code / Codex
// logins that used to be listed on this page were removed (docs/adr/0003-git-workflow.md, D6).
export function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Profile & access tokens"
        description="Your git identity for commits you approve, and tokens for the aura CLI. Coding at Gate 5 runs on AURA's own agents - there is no external account or key to connect."
      />
      <div className="space-y-6">
        <GitIdentityCard />
        <AccessTokensCard />
      </div>
    </>
  );
}
