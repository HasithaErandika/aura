import { useState } from "react";
import { describeError } from "@/shared/api/errors.ts";
import { Button } from "@/shared/ui/Button.tsx";
import { runsApi } from "../api.ts";

export function StopRunButton({ runId, onStopped }: { runId: string; onStopped: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      await runsApi.stop(runId);
      onStopped();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="danger" loading={busy} onClick={() => void stop()}>
        Stop run
      </Button>
      {error ? <span className="text-xs text-danger" role="alert">{error}</span> : null}
    </>
  );
}
