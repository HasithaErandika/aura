import { useState } from "react";
import { describeError, isConflict } from "@/shared/api/errors.ts";
import { cn } from "@/shared/lib/cn.ts";
import { Alert } from "@/shared/ui/Alert.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { Input } from "@/shared/ui/Input.tsx";
import { Markdown } from "@/shared/ui/Markdown.tsx";
import { Textarea } from "@/shared/ui/Textarea.tsx";
import { designDocsApi } from "../api.ts";
import type { DesignDoc } from "../types.ts";

const CONFLICT = "Someone saved a newer version while you were editing. Copy your changes, reload, and apply them to the latest version.";

export function DocumentEditor({ doc, content, onSaved }: { doc: DesignDoc; content: string; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(content);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const dirty = draft !== content;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await designDocsApi.save(doc.id, { content: draft, baseVersion: doc.currentVersion, ...(note.trim() ? { note: note.trim() } : {}) });
      await onSaved();
    } catch (err) {
      setError(isConflict(err) ? CONFLICT : describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-500">Markdown. Saving adds version {doc.currentVersion + 1}; earlier versions stay in History.</p>
        <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
          {preview ? "Hide preview" : "Show preview"}
        </Button>
      </div>
      <div className={cn("grid grid-cols-1 gap-4", preview && "lg:grid-cols-2")}>
        <Textarea aria-label="Document content" className="min-h-[50vh] font-mono text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
        {preview ? (
          <div className="min-w-0 rounded-lg border border-line p-4">
            <Markdown source={draft} />
          </div>
        ) : null}
      </div>
      <Input aria-label="What changed" placeholder="What changed (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} disabled={!dirty} onClick={() => void save()}>
          Save version
        </Button>
        <Button variant="ghost" disabled={!dirty || busy} onClick={() => setDraft(content)}>
          Discard changes
        </Button>
      </div>
    </div>
  );
}
