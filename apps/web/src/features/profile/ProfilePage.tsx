import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { AccessTokensCard } from "./AccessTokensCard.tsx";
import { PreferencesCard } from "./PreferencesCard.tsx";

export function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile and access tokens" description="Your VS Code preferences and the tokens the VS Code extension uses to act as you." />
      <PreferencesCard />
      <AccessTokensCard />
    </>
  );
}
