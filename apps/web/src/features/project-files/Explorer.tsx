import { useMemo, useState, type ReactNode } from "react";
import type { AsyncState } from "../../shared/hooks/useAsync.ts";
import { FileTree } from "../../shared/ui/FileTree.tsx";
import { ChevronRightIcon, SearchIcon } from "../../shared/icons/index.tsx";
import { vscode } from "../../shared/lib/vscodeTheme.ts";
import { cn } from "../../shared/lib/cn.ts";
import { workspaceFileTitle } from "./api.ts";
import { SOURCE_ORDER, SOURCES, type Location, type SourceFile } from "./sources.ts";
import type { ProjectFilesAccess, Source } from "./access.ts";
import type { Selection } from "./hooks.ts";

// VS Code-style Explorer: one collapsible section per source this role may see (Architecture →
// QA → Code), each in its own accent colour with a file count and a read-only/editable marker,
// plus one filter box across all of them. Sections the role cannot see are not rendered at all.

interface Props {
  location: Location | null;
  access: ProjectFilesAccess;
  lists: Record<Source, AsyncState<SourceFile[] | null>>;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  headerAction?: ReactNode;
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-1.5 text-xs" style={{ color: vscode.mutedText }}>
      {children}
    </p>
  );
}

function SectionHeader({ source, open, count, editable, onToggle }: { source: Source; open: boolean; count: number | null; editable: boolean; onToggle: () => void }) {
  const meta = SOURCES[source];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="group flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left hover:bg-white/5"
      style={{ boxShadow: `inset 2px 0 0 ${meta.color}` }}
    >
      <ChevronRightIcon className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} style={{ color: vscode.mutedText }} />
      <Icon className="size-3.5 shrink-0" style={{ color: meta.color }} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide uppercase" style={{ color: vscode.text }}>
        {meta.label}
      </span>
      <span className="rounded px-1 text-[10px]" style={{ color: editable ? meta.color : vscode.mutedText, border: `1px solid ${editable ? `${meta.color}66` : vscode.border}` }}>
        {editable ? "edit" : "read"}
      </span>
      {count !== null ? (
        <span className="min-w-5 text-right font-mono text-[10px]" style={{ color: vscode.mutedText }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

// Design documents read best as a titled list with their kind (Architecture, Plan, ADR…) rather
// than a folder tree.
function DesignList({ files, selectedPath, onSelect }: { files: SourceFile[]; selectedPath: string | null; onSelect: (path: string) => void }) {
  const meta = SOURCES.design;
  return (
    <ul className="py-0.5">
      {files.map((f) => {
        const selected = f.path === selectedPath;
        return (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => onSelect(f.path)}
              title={f.path}
              className="flex w-full items-center gap-2 rounded py-1 pr-2 pl-6 text-left text-[13px] hover:bg-white/5"
              style={selected ? { backgroundColor: vscode.selectedBg, color: vscode.selectedText } : { color: vscode.text }}
            >
              <span className="min-w-0 flex-1 truncate capitalize">{workspaceFileTitle(f.path)}</span>
              <span className="shrink-0 rounded px-1 text-[10px]" style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}>
                {meta.kindOf(f.path)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Explorer({ location, access, lists, selection, onSelect, headerAction }: Props) {
  // The role's own work starts open (Developer: code, QA: QA, Architect/PO/BA: architecture); the
  // rest start collapsed, one click away.
  const [collapsed, setCollapsed] = useState<Set<Source>>(() => new Set(SOURCE_ORDER.filter((s) => s !== access.defaultSection)));
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const visible = SOURCE_ORDER.filter((s) => access.see[s]);

  const filtered = useMemo(() => {
    const out: Partial<Record<Source, SourceFile[]>> = {};
    for (const s of SOURCE_ORDER) {
      const files = lists[s].data ?? [];
      out[s] = query ? files.filter((f) => f.path.toLowerCase().includes(query)) : files;
    }
    return out as Record<Source, SourceFile[]>;
  }, [lists, query]);

  const toggle = (s: Source) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-col" style={{ backgroundColor: vscode.sidebarBg, borderRight: `1px solid ${vscode.border}` }}>
      <div className="shrink-0 space-y-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${vscode.border}` }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: vscode.mutedText }}>
            Explorer
          </p>
          {headerAction}
        </div>
        <p className="truncate font-mono text-xs font-semibold" style={{ color: vscode.text }}>
          {location ? (
            <>
              {location.epicKey}
              {access.see.code ? <span style={{ color: vscode.mutedText }}> / {location.taskKey ?? `${location.discipline.toLowerCase()} base`}</span> : null}
            </>
          ) : (
            <span style={{ color: vscode.mutedText }}>no Epic open</span>
          )}
        </p>
        {location ? (
          <div className="flex items-center gap-1.5 rounded px-2 py-1" style={{ backgroundColor: vscode.editorBg, border: `1px solid ${vscode.border}` }}>
            <SearchIcon className="size-3.5 shrink-0" style={{ color: vscode.mutedText }} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter files"
              aria-label="Filter files"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[#6a6a6a]"
              style={{ color: vscode.text }}
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
        {!location ? (
          <Muted>Open an Epic above to browse its {visible.map((s) => SOURCES[s].label.toLowerCase()).join(", ")} files.</Muted>
        ) : (
          visible.map((source) => {
            const state = lists[source];
            const files = filtered[source];
            const open = !collapsed.has(source);
            return (
              <section key={source}>
                <SectionHeader source={source} open={open} count={state.data ? files.length : null} editable={access.edit[source]} onToggle={() => toggle(source)} />
                {open ? (
                  state.loading && !state.data ? (
                    <div className="space-y-1.5 py-2 pl-7">
                      <div className="h-3 w-32 animate-pulse rounded" style={{ backgroundColor: vscode.hoverBg }} />
                      <div className="h-3 w-24 animate-pulse rounded" style={{ backgroundColor: vscode.hoverBg }} />
                    </div>
                  ) : state.error || !state.data || state.data.length === 0 ? (
                    <Muted>{SOURCES[source].emptyMessage(location)}</Muted>
                  ) : files.length === 0 ? (
                    <Muted>No match for “{filter}”.</Muted>
                  ) : source === "design" ? (
                    <DesignList files={files} selectedPath={selection?.source === "design" ? selection.path : null} onSelect={(path) => onSelect({ source, path })} />
                  ) : (
                    <div className="pl-3">
                      <FileTree
                        key={`${source}-${location.epicKey}-${location.discipline}-${location.taskKey ?? "base"}-${query}`}
                        files={files}
                        selectedPath={selection?.source === source ? selection.path : null}
                        onSelect={(path) => onSelect({ source, path })}
                      />
                    </div>
                  )
                ) : null}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
