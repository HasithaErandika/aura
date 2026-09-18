import { useState } from "react";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { describeError } from "../../shared/api/errors.ts";
import { credentialsApi, type CredentialProvider, type CredentialSummary } from "./api.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card, CardHeader, CardBody } from "../../shared/ui/Card.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Input } from "../../shared/ui/Field.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { BrainIcon, CodeIcon, SparkleIcon, TrashIcon } from "../../shared/icons/index.tsx";
import { timeAgo } from "../../shared/lib/format.ts";

interface ProviderMeta {
  provider: CredentialProvider;
  name: string;
  usedFor: string;
  icon: typeof BrainIcon;
  placeholder: string;
  consoleName: string;
  consoleUrl: string;
}

const PROVIDERS: ProviderMeta[] = [
  { provider: "anthropic", name: "Anthropic", usedFor: "Claude Code", icon: BrainIcon, placeholder: "sk-ant-...", consoleName: "console.anthropic.com", consoleUrl: "https://console.anthropic.com" },
  { provider: "openai", name: "OpenAI", usedFor: "Codex", icon: CodeIcon, placeholder: "sk-...", consoleName: "platform.openai.com", consoleUrl: "https://platform.openai.com" },
];

export function ProfilePage() {
  const state = useAsync(() => credentialsApi.list(), []);
  const byProvider = new Map((state.data ?? []).map((c) => [c.provider, c]));

  return (
    <>
      <PageHeader
        title="Profile & connected accounts"
        description="Connect your own API keys so the Coding Agent (Gate 5) can run Claude Code or Codex on your behalf, inside a sandbox, only on Tasks you approve. Keys are encrypted at rest and never shown again after you save them. AURA's own built-in Coding Agent needs no key at all."
      />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PROVIDERS.map((meta) => (
          <ProviderCard key={meta.provider} meta={meta} summary={byProvider.get(meta.provider) ?? null} loading={state.loading && !state.data} onChanged={() => void state.reload()} />
        ))}
        <BuiltInCard />
      </div>
    </>
  );
}

// AURA's own built-in Coding Agent (provider "mastra") - no key to connect, so this is
// informational only, not another ProviderCard.
function BuiltInCard() {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-neutral-soft text-ink-600">
              <SparkleIcon className="size-4" />
            </span>
            AURA Coding Agent
          </span>
        }
        description="Built-in"
        actions={
          <Badge tone="success" dot>
            Always available
          </Badge>
        }
      />
      <CardBody>
        <p className="text-xs text-ink-500">
          Runs on AURA's own model, with no external account or key. Reads and writes files directly inside a Task's own scaffolded directory - nothing more, no shell access. Select it as the coding agent when running Gate 5.
        </p>
      </CardBody>
    </Card>
  );
}

function ProviderCard({
  meta,
  summary,
  loading,
  onChanged,
}: {
  meta: ProviderMeta;
  summary: CredentialSummary | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await credentialsApi.set(meta.provider, value.trim());
      setValue("");
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await credentialsApi.remove(meta.provider);
      setConfirmingRemove(false);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  const Icon = meta.icon;
  const connected = summary?.connected ?? false;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-neutral-soft text-ink-600">
              <Icon className="size-4" />
            </span>
            {meta.name}
          </span>
        }
        description={`For ${meta.usedFor}`}
        actions={
          loading ? null : (
            <Badge tone={connected ? "success" : "neutral"} dot>
              {connected ? "Connected" : "Not connected"}
            </Badge>
          )
        }
      />
      <CardBody className="space-y-3">
        {loading ? (
          <Skeleton className="h-9 w-full" />
        ) : editing ? (
          <div className="space-y-2">
            <Input type="password" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={meta.placeholder} className="font-mono text-sm" />
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setValue("");
                  setError(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={() => void save()} loading={saving} disabled={!value.trim()}>
                Save
              </Button>
            </div>
          </div>
        ) : connected ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-line bg-neutral-soft/40 px-3 py-2">
              <span className="font-mono text-xs text-ink-700">{summary?.preview}</span>
              <span className="text-[11px] text-ink-400">Updated {timeAgo(summary?.updatedAt)}</span>
            </div>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            <div className="flex justify-end gap-2">
              {confirmingRemove ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void remove()} loading={saving}>
                    Confirm disconnect
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                    Replace key
                  </Button>
                  <Button size="sm" variant="danger" icon={<TrashIcon className="size-3.5" />} onClick={() => setConfirmingRemove(true)}>
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-500">
              Get a key from{" "}
              <a href={meta.consoleUrl} target="_blank" rel="noreferrer" className="font-medium text-ink-700 underline hover:text-ink-900">
                {meta.consoleName}
              </a>
              .
            </p>
            <Button size="sm" variant="primary" onClick={() => setEditing(true)}>
              Connect
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
