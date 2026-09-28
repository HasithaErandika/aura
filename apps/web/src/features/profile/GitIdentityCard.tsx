import { useEffect, useState } from "react";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { describeError } from "../../shared/api/errors.ts";
import { Card, CardHeader, CardBody } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Input, Field } from "../../shared/ui/Field.tsx";
import { gitIdentityApi } from "./api.ts";

// The name/email AURA commits as when this user approves a gate - council checkpoints, approved
// git commits and Tester-loop fixes (ADR-3). `aura login` fills it from the developer's own git
// config; this card is for anyone who only approves from the browser.
export function GitIdentityCard() {
  const identity = useAsync(() => gitIdentityApi.get(), []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity.data) return;
    setName(identity.data.name ?? "");
    setEmail(identity.data.email ?? "");
  }, [identity.data]);

  const isSet = Boolean(identity.data?.name && identity.data?.email);
  const changed = name.trim() !== (identity.data?.name ?? "") || email.trim() !== (identity.data?.email ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await gitIdentityApi.save(name.trim(), email.trim());
      await identity.reload();
      setSaved(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Git identity"
        description="Commits AURA makes after you approve a gate are authored as you, with AURA as the committer. Without this, AURA authors them and records you in an Approved-by line."
      />
      <CardBody>
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          {identity.error && <Alert tone="danger">{identity.error}</Alert>}
          {identity.data && !isSet && <Alert tone="warning">Not set - commits you approve are authored by AURA.</Alert>}
          {saved && <Alert tone="success">Saved. Approvals from now on commit as {name.trim()} &lt;{email.trim()}&gt;.</Alert>}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Field label="Name" htmlFor="git-name">
                <Input id="git-name" placeholder="Your Name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <div className="min-w-48 flex-1">
              <Field label="Email" htmlFor="git-email" hint="Use an email verified on your GitHub account so commits link to you.">
                <Input id="git-email" type="email" placeholder="you@example.com" maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
            <Button variant="primary" loading={saving} disabled={!name.trim() || !email.trim() || !changed} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
