import { useAsync } from "../../shared/hooks/useAsync.ts";
import { Card, CardHeader } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { SkeletonRows } from "../../shared/ui/Skeleton.tsx";
import { settingsApi, type SettingValue } from "../settings/api.ts";
import { SettingField } from "../settings/SettingField.tsx";

// Profile → Preferences: personal values for the settings that allow them (Coding Council mode,
// a lower personal token budget). Anything not set here follows the project and global values.
export function PreferencesCard() {
  const definitions = useAsync(() => settingsApi.definitions(), []);
  const mine = useAsync(() => settingsApi.mine(), []);
  // Without the personal values, so "inherited" shows what applies when one is reset.
  const shared = useAsync(() => settingsApi.effective({ includeMine: false }), []);

  const personal = (definitions.data ?? []).filter((d) => d.scopes.includes("user"));
  const error = definitions.error ?? mine.error ?? shared.error;

  function inherited(key: string, fallback: SettingValue): { value: SettingValue; from: string } {
    const e = shared.data?.settings[key];
    return e ? { value: e.value, from: e.source } : { value: fallback, from: "default" };
  }

  return (
    <Card>
      <CardHeader title="Preferences" description="Your own defaults for coding runs. They never exceed the limits an admin set for the project." />
      {error ? (
        <div className="px-5 pb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      {definitions.loading && !definitions.data ? (
        <SkeletonRows rows={2} />
      ) : (
        personal.map((def) => {
          const from = inherited(def.key, def.default);
          return (
            <SettingField
              key={def.key}
              definition={def}
              stored={mine.data?.find((s) => s.key === def.key)?.value}
              inherited={from.value}
              inheritedFrom={from.from}
              onSave={async (value) => {
                await settingsApi.set(def.key, "user", null, value);
                await mine.reload();
              }}
              onReset={async () => {
                await settingsApi.reset(def.key, "user", null);
                await mine.reload();
              }}
            />
          );
        })
      )}
    </Card>
  );
}
