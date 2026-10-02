import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client.ts";
import { describeError } from "../../shared/api/errors.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card, CardBody, CardHeader } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Field, Input } from "../../shared/ui/Field.tsx";

interface DeviceGrant {
  userCode: string;
  clientName: string;
  expiresAt: string;
}

// Approve a VS Code sign-in (apps/api modules/identity/device.router.ts). VS Code shows a code
// and opens this page with it; approving creates a 90-day access token for that VS Code, listed
// (and revocable) on the Profile page.
export function DeviceApprovalPage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [grant, setGrant] = useState<DeviceGrant | null>(null);
  const [result, setResult] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(value: string) {
    setError(null);
    setGrant(null);
    if (!value.trim()) return;
    try {
      setGrant(await api.get<DeviceGrant>(`/device/${encodeURIComponent(value.trim())}`));
    } catch (e) {
      setError(describeError(e));
    }
  }

  useEffect(() => {
    void load(params.get("code") ?? "");
  }, [params]);

  async function decide(decision: "approve" | "deny") {
    if (!grant) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/device/${decision}`, { userCode: grant.userCode });
      setResult(decision === "approve" ? "approved" : "denied");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void load(code);
  }

  return (
    <>
      <PageHeader title="Sign in to VS Code" description="Connect AURA for VS Code to your account." />
      <div className="max-w-xl space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {result === "approved" ? <Alert tone="success">Done. Return to VS Code: it is signed in. You can revoke this access any time on your Profile page.</Alert> : null}
        {result === "denied" ? <Alert tone="warning">Sign-in refused. Nothing was connected.</Alert> : null}

        {!result && grant ? (
          <Card>
            <CardHeader title={`Code ${grant.userCode}`} description="Check this code matches the one shown in VS Code." />
            <CardBody>
              <p className="text-sm text-ink-700">
                <strong>{grant.clientName}</strong> wants to act as you in AURA: read your Tasks and run the VS Code agent in folders you open. It gets a 90-day access token.
              </p>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" loading={busy} onClick={() => void decide("approve")}>
                  Approve
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void decide("deny")}>
                  Deny
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}

        {!result && !grant ? (
          <Card className="p-5">
            <form onSubmit={submit} className="flex items-end gap-3">
              <div className="flex-1">
                <Field label="Code shown in VS Code" htmlFor="device-code">
                  <Input id="device-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" autoComplete="off" className="uppercase" />
                </Field>
              </div>
              <Button type="submit" variant="primary">
                Continue
              </Button>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
