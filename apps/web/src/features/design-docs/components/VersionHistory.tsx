import { useState } from "react";
import { describeError } from "@/shared/api/errors.ts";
import { timeAgo } from "@/shared/lib/format.ts";
import { Alert } from "@/shared/ui/Alert.tsx";
import { Badge } from "@/shared/ui/Badge.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { Markdown } from "@/shared/ui/Markdown.tsx";
import { designDocsApi } from "../api.ts";
import { versionAuthor } from "../lib/docs.ts";
import type { DocVersion } from "../types.ts";

export function VersionHistory({ docId, versions }: { docId: string; versions: DocVersion[] }) {
  const [viewing, setViewing] = useState<{ version: number; content: string } | null>(null);
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(version: number) {
    setLoading(version);
    setError(null);
    try {
      const r = await designDocsApi.version(docId, version);
      setViewing({ version, content: r.content });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(null);
    }
  }

  if (viewing) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">Version {viewing.version}</Badge>
          <Button size="sm" variant="ghost" onClick={() => setViewing(null)}>
            Back to history
          </Button>
        </div>
        <Markdown source={viewing.content} />
      </div>
    );
  }

  const sorted = [...versions].sort((a, b) => b.version - a.version);
  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <ul className="divide-y divide-line">
        {sorted.map((v) => (
          <li key={v.version} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p>
                <span className="font-medium text-ink-900">Version {v.version}</span>
                <span className="text-ink-500">
                  {" "}
                  · {versionAuthor(v)} · {timeAgo(v.createdAt)}
                </span>
              </p>
              {v.note ? <p className="truncate text-xs text-ink-500">{v.note}</p> : null}
            </div>
            <Button size="sm" variant="ghost" loading={loading === v.version} disabled={loading !== null} onClick={() => void open(v.version)}>
              View
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
