import { useState } from "react";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { describeError } from "../../shared/api/errors.ts";
import { env } from "../../config/env.ts";
import { Card, CardHeader, CardBody } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Input, Select, Field } from "../../shared/ui/Field.tsx";
import { PlusIcon, TrashIcon } from "../../shared/icons/index.tsx";
import { tokensApi, type AccessToken } from "./api.ts";

const EXPIRY_OPTIONS = [30, 90, 180, 365];

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "never";
}

function tokenStatus(token: AccessToken) {
  if (token.revoked) return <Badge tone="neutral">Revoked</Badge>;
  if (token.expired) return <Badge tone="warning">Expired</Badge>;
  return <Badge tone="success" dot>Active</Badge>;
}

// Personal access tokens for the `aura` CLI and the VS Code extension. The raw token is shown
// exactly once, right after creation - the API only keeps its hash.
export function AccessTokensCard() {
  const tokens = useAsync(() => tokensApi.list(), []);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setError(null);
    setCopied(false);
    try {
      const result = await tokensApi.create(name.trim() || "aura CLI", expiresInDays);
      setCreated(result.token);
      setName("");
      await tokens.reload();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await tokensApi.revoke(id);
      await tokens.reload();
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created);
    setCopied(true);
  }

  const loginCommand = `aura login --api ${env.apiUrl}`;

  return (
    <Card>
      <CardHeader title="Access tokens" description="For the aura CLI and the VS Code extension. A token acts as you, with your role - revoke it if it leaks." />
      <CardBody>
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          {created && (
            <Alert tone="success" title="Copy this token now - it will not be shown again">
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs">{created}</code>
                <Button size="sm" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="mt-2 text-xs">
                Then run <code className="font-mono">{loginCommand}</code> and paste it when asked.
              </p>
            </Alert>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Field label="Name" htmlFor="token-name">
                <Input id="token-name" placeholder="laptop CLI" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <Field label="Expires in" htmlFor="token-expiry">
              <Select id="token-expiry" value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))}>
                {EXPIRY_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="primary" icon={<PlusIcon className="size-4" />} loading={creating} onClick={create}>
              Create token
            </Button>
          </div>

          {tokens.error && <Alert tone="danger">{tokens.error}</Alert>}
          {tokens.data && tokens.data.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className="text-ink-500">
                <tr>
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Token</th>
                  <th className="py-2 font-medium">Last used</th>
                  <th className="py-2 font-medium">Expires</th>
                  <th className="py-2 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tokens.data.map((token) => (
                  <tr key={token.id}>
                    <td className="py-2 text-ink-800">{token.name}</td>
                    <td className="py-2 font-mono text-ink-600">{token.prefix}…</td>
                    <td className="py-2 text-ink-600">{formatDate(token.lastUsedAt)}</td>
                    <td className="py-2 text-ink-600">{formatDate(token.expiresAt)}</td>
                    <td className="py-2">{tokenStatus(token)}</td>
                    <td className="py-2 text-right">
                      {!token.revoked && (
                        <Button size="sm" variant="danger" icon={<TrashIcon className="size-3.5" />} onClick={() => revoke(token.id)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
