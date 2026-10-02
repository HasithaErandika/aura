import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { AccessTokensCard } from "./AccessTokensCard.tsx";
import { GitIdentityCard } from "./GitIdentityCard.tsx";
import { PreferencesCard } from "./PreferencesCard.tsx";

// Profile: your git identity, coding preferences and personal access tokens.
export function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Profile & access tokens"
        description="Your git identity for commits you approve, your coding preferences, and access tokens. Coding runs on AURA's own agents - there is no external account or key to connect."
      />
      <div className="space-y-6">
        <GitIdentityCard />
        <PreferencesCard />
        <AccessTokensCard />
      </div>
    </>
  );
}
