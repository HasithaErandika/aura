import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { AccessTokensCard } from "./AccessTokensCard.tsx";

// Profile - personal access tokens for the `aura` CLI (and later the VS Code extension). Coding
// itself needs nothing connected here: Gate 5 runs AURA's own agents (Coding Council or the single
// built-in agent) on AURA-governed models - the external Claude Code / Codex logins that used to be
// listed on this page were removed (docs/adr/0003-git-workflow.md, D6).
export function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Profile & access tokens"
        description="Create a token for the aura CLI. Coding at Gate 5 runs on AURA's own agents - there is no external account or key to connect."
      />
      <AccessTokensCard />
    </>
  );
}
