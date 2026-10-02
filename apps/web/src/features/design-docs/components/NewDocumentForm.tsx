import { useState, type FormEvent } from "react";
import { describeError } from "@/shared/api/errors.ts";
import { PlusIcon } from "@/shared/icons/index.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { Input } from "@/shared/ui/Input.tsx";
import { designDocsApi } from "../api.ts";
import type { DesignDoc, DocKind } from "../types.ts";

export function NewDocumentForm({ epicKey, kind, onCreated }: { epicKey: string; kind: DocKind; onCreated: (doc: DesignDoc) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind === "adr" ? "New ADR" : "New scenario";

  async function create(e: FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await designDocsApi.create({ epicKey, kind, title: name, content: `# ${name}\n` });
      setOpen(false);
      setTitle("");
      await onCreated(doc);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="px-3 pb-3">
        <Button size="sm" variant="ghost" icon={<PlusIcon className="size-4" />} onClick={() => setOpen(true)}>
          {label}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void create(e)} className="space-y-2 px-3 pb-3">
      <Input autoFocus aria-label={`${label} title`} maxLength={300} placeholder={kind === "adr" ? "Decision title" : "Scenario title"} value={title} onChange={(e) => setTitle(e.target.value)} />
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" type="submit" variant="primary" loading={busy} disabled={!title.trim()}>
          Create
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
