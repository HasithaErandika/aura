import type { ReactNode } from "react";
import type { Selection } from "./hooks.ts";
import type { Location } from "./sources.ts";
import { SOURCES } from "./sources.ts";

// VS Code's status bar: where you are (Epic, branch/worktree), what is open, and whether it is
// editable - one glance instead of reading the header.

function Item({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="truncate" title={title}>
      {children}
    </span>
  );
}

export function StatusBar({ location, selection, editable, editing, roleLabel }: { location: Location | null; selection: Selection | null; editable: boolean; editing: boolean; roleLabel: string }) {
  const ext = selection?.path.split(".").pop()?.toLowerCase();
  return (
    <div className="flex h-6 shrink-0 items-center gap-4 px-3 text-[11px] text-white" style={{ backgroundColor: editing ? "#c2410c" : "#007acc" }}>
      <Item title="Epic">{location ? `⎇ ${location.taskKey ? `feature/${location.taskKey}` : `${location.discipline.toLowerCase()} base`}` : "no Epic"}</Item>
      {location ? <Item>{location.epicKey}</Item> : null}
      <span className="flex-1" />
      {selection ? (
        <>
          <Item>{SOURCES[selection.source].label}</Item>
          {ext ? <Item>{ext}</Item> : null}
          <Item>{editing ? "● editing - Ctrl+S to save" : editable ? "editable" : "read-only"}</Item>
        </>
      ) : null}
      <Item title="Your role">{roleLabel}</Item>
    </div>
  );
}
