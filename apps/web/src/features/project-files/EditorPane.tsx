import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { Textarea } from "../../shared/ui/Field.tsx";
import { Markdown } from "../../shared/ui/Markdown.tsx";
import { DocumentIcon, SendIcon, TreeIcon } from "../../shared/icons/index.tsx";
import { vscode } from "../../shared/lib/vscodeTheme.ts";
import { describeError } from "../../shared/api/errors.ts";
import { languageExtension } from "./language.ts";
import { SOURCES } from "./sources.ts";
import type { Selection, useOpenFile } from "./hooks.ts";

// The editor: a tab-style header (source badge, path, kind, actions), then the file - rendered
// Markdown or CodeMirror. Edit/Save/Cancel appear only when this role may edit this source;
// Ctrl+S saves and Esc cancels while editing (hooks.ts useOpenFile). Design documents can be
// commented on - the comment goes to the Architect agent as a revision request.

type OpenFile = ReturnType<typeof useOpenFile>;

const PREVIEW_STYLE =
  "h-full overflow-y-auto px-6 py-4 [&_code]:bg-white/10 [&_code]:text-[#ce9178] [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_hr]:border-white/10 [&_li]:text-[#cccccc] [&_p]:text-[#cccccc] [&_pre]:border-white/10 [&_pre]:bg-black/30 [&_pre]:text-[#d4d4d4] [&_strong]:text-white [&_td]:text-[#cccccc] [&_th]:text-white";

function FeedbackBox({ onSend, onClose }: { onSend: (text: string) => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setSending(true);
    setError(null);
    try {
      await onSend(text.trim());
    } catch (e) {
      setError(describeError(e));
      setSending(false);
    }
  }
  return (
    <div className="shrink-0 space-y-2 px-4 py-3" style={{ backgroundColor: vscode.sidebarBg, borderBottom: `1px solid ${vscode.border}` }}>
      <p className="text-xs font-medium" style={{ color: vscode.text }}>
        Send feedback to the Architect - it revises this design and updates the filed Jira Tasks in place.
      </p>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What should change, and why?" className="text-sm" autoFocus />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" icon={<SendIcon className="size-3.5" />} onClick={() => void send()} loading={sending} disabled={!text.trim()}>
          Send to Architect
        </Button>
      </div>
    </div>
  );
}

interface Props {
  hasLocation: boolean;
  selection: Selection | null;
  open: OpenFile;
  canComment: boolean;
  onSendFeedback: (text: string) => Promise<void>;
}

export function EditorPane({ hasLocation, selection, open, canComment, onSendFeedback }: Props) {
  const [mode, setMode] = useState<"preview" | "source">("preview");
  const [commenting, setCommenting] = useState(false);
  useEffect(() => setCommenting(false), [selection?.source, selection?.path]);

  // Ctrl+Shift+V toggles Markdown preview, as in VS Code.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        setMode((m) => (m === "source" ? "preview" : "source"));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!selection) {
    return (
      <EmptyState
        icon={hasLocation ? <DocumentIcon className="size-5" /> : <TreeIcon className="size-5" />}
        title={hasLocation ? "Select a file" : "Open an Epic"}
        description={hasLocation ? "Pick a file from the Explorer." : "Enter an Epic key above - its files open here."}
        className="h-full py-16"
      />
    );
  }
  if (open.file.error) {
    return (
      <div className="p-5">
        <Alert tone="danger">{open.file.error}</Alert>
      </div>
    );
  }
  if (!open.file.data) {
    return (
      <div className="p-5">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const meta = SOURCES[selection.source];
  const Icon = meta.icon;
  const kind = meta.kindOf(selection.path);
  const isMarkdown = selection.path.toLowerCase().endsWith(".md");
  const showPreview = isMarkdown && !open.editing && mode === "preview";
  const content = open.file.data.content;

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2" style={{ backgroundColor: vscode.tabBarBg, borderBottom: `1px solid ${vscode.border}`, boxShadow: `inset 0 2px 0 ${meta.color}` }}>
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0" style={{ color: meta.color }} />
          <p className="truncate font-mono text-[13px] font-semibold" style={{ color: vscode.text }} title={selection.path}>
            {selection.path}
          </p>
          <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold" style={{ color: meta.color, backgroundColor: `${meta.color}1f` }}>
            {kind ?? meta.label}
          </span>
          {!open.canEdit ? (
            <span className="shrink-0 text-[10px]" style={{ color: vscode.mutedText }}>
              read-only
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isMarkdown && !open.editing ? (
            <div className="flex items-center rounded-md p-0.5 text-xs" style={{ border: `1px solid ${vscode.border}` }}>
              {(["preview", "source"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="rounded px-2.5 py-1 font-medium capitalize"
                  style={mode === m ? { backgroundColor: vscode.selectedBg, color: vscode.selectedText } : { color: vscode.mutedText }}
                  title="Ctrl+Shift+V"
                >
                  {m}
                </button>
              ))}
            </div>
          ) : null}
          {selection.source === "design" && canComment && !open.editing ? (
            <Button size="sm" variant="secondary" icon={<SendIcon className="size-3.5" />} onClick={() => setCommenting((v) => !v)}>
              Comment
            </Button>
          ) : null}
          {open.canEdit ? (
            open.editing ? (
              <>
                <Button size="sm" variant="secondary" onClick={open.cancel} disabled={open.saving} title="Esc">
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={() => void open.save()} loading={open.saving} title="Ctrl+S">
                  Save
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={open.startEdit}>
                Edit
              </Button>
            )
          ) : null}
        </div>
      </div>

      {open.editing ? (
        <div className="shrink-0 border-b border-line bg-warning-soft px-4 py-1.5 text-xs text-warning">
          Editing - Ctrl+S saves, Esc cancels. Hand edits aren't versioned: this file is overwritten if {meta.overwrittenBy}.
        </div>
      ) : null}
      {open.saveError ? (
        <div className="shrink-0 px-4 pt-2">
          <Alert tone="danger">{open.saveError}</Alert>
        </div>
      ) : null}
      {commenting ? (
        <FeedbackBox
          onClose={() => setCommenting(false)}
          onSend={async (text) => {
            await onSendFeedback(text);
          }}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {showPreview ? (
          <div className={PREVIEW_STYLE} style={{ backgroundColor: vscode.editorBg }}>
            <Markdown source={content} />
          </div>
        ) : (
          <CodeMirror
            value={open.editing ? open.draft : content}
            onChange={open.editing ? (value) => open.setDraft(value) : undefined}
            editable={open.editing}
            height="100%"
            theme={vscodeDark}
            extensions={languageExtension(selection.path)}
            basicSetup={{ lineNumbers: true, foldGutter: true }}
            className="h-full text-sm"
          />
        )}
      </div>
    </>
  );
}
