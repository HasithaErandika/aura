import { useState, type FormEvent, type KeyboardEvent } from "react";
import { CheckIcon, XIcon } from "@/shared/icons/index.tsx";
import { IconButton } from "@/shared/ui/IconButton.tsx";
import { Input } from "@/shared/ui/Input.tsx";

export function ThreadTitleEditor({ initial, onSave, onCancel }: { initial: string; onSave: (title: string) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const title = value.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      await onSave(title);
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") onCancel();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex min-w-0 items-center gap-1">
      <Input autoFocus aria-label="Conversation title" maxLength={200} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKeyDown} className="h-8 text-sm" />
      <IconButton type="submit" label="Save title" tone="success" disabled={saving || !value.trim()} icon={<CheckIcon className="size-4" />} />
      <IconButton label="Cancel" onClick={onCancel} icon={<XIcon className="size-4" />} />
    </form>
  );
}
