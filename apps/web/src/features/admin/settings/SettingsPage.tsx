import { useState } from "react";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { Card } from "@/shared/ui/Card.tsx";
import { CardHeader } from "@/shared/ui/CardHeader.tsx";
import { Alert } from "@/shared/ui/Alert.tsx";
import { Field } from "@/shared/ui/Field.tsx";
import { Select } from "@/shared/ui/Select.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";
import { projectsApi } from "../projects/api.ts";
import { GROUP_LABELS, settingsApi, type SettingDefinition, type SettingGroup, type SettingValue, type StoredSetting } from "@/shared/settings/api.ts";
import { SettingField } from "@/shared/settings/SettingField.tsx";

export function SettingsPage() {
  const [scopeId, setScopeId] = useState<string>("");
  const definitions = useAsync(() => settingsApi.definitions(), []);
  const projects = useAsync(() => projectsApi.list(), []);
  const global = useAsync(() => settingsApi.list("global"), []);
  const project = useAsync(() => (scopeId ? settingsApi.list("project", scopeId) : Promise.resolve([] as StoredSetting[])), [scopeId]);

  const scope = scopeId ? "project" : "global";
  const valueIn = (rows: StoredSetting[] | null, key: string) => rows?.find((r) => r.key === key)?.value;

  function inherited(def: SettingDefinition): { value: SettingValue; from: string } {
    if (scope === "project") {
      const g = valueIn(global.data, def.key);
      if (g !== undefined) return { value: g, from: "global" };
    }
    return { value: def.default, from: def.owner === "runtime" ? "default (.env may override)" : "default" };
  }

  async function reload() {
    await Promise.all([global.reload(), project.reload()]);
  }

  const visible = (definitions.data ?? []).filter((d) => d.scopes.includes(scope));
  const groups = (Object.keys(GROUP_LABELS) as SettingGroup[]).map((g) => ({ group: g, items: visible.filter((d) => d.group === g) })).filter((g) => g.items.length > 0);
  const rows = scope === "project" ? project.data : global.data;
  const error = definitions.error ?? global.error ?? project.error ?? projects.error;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Agent limits and governance values. A project value overrides the global one. Secrets, URLs and security switches stay in .env."
        actions={
          <div className="w-64">
            <Field label="Scope" htmlFor="settings-scope">
              <Select id="settings-scope" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                <option value="">Global (all projects)</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {`Project ${p.key} · ${p.name}`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="space-y-6">
        {definitions.loading && !definitions.data ? (
          <Card>
            <SkeletonRows rows={4} />
          </Card>
        ) : (
          groups.map(({ group, items }) => (
            <Card key={group}>
              <CardHeader title={GROUP_LABELS[group].title} description={GROUP_LABELS[group].description} />
              {items.map((def) => {
                const from = inherited(def);
                return (
                  <SettingField
                    key={`${scopeId}:${def.key}`}
                    definition={def}
                    stored={valueIn(rows, def.key)}
                    inherited={from.value}
                    inheritedFrom={from.from}
                    onSave={async (value) => {
                      await settingsApi.set(def.key, scope, scopeId || null, value);
                      await reload();
                    }}
                    onReset={async () => {
                      await settingsApi.reset(def.key, scope, scopeId || null);
                      await reload();
                    }}
                  />
                );
              })}
            </Card>
          ))
        )}
      </div>
    </>
  );
}
