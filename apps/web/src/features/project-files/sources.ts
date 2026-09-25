import type { ComponentType, SVGProps } from "react";
import { ClipboardCheckIcon, CodeIcon, DocumentIcon } from "../../shared/icons/index.tsx";
import { classifyQaFile, classifyWorkspaceFile, designDocsApi, devFilesApi, qaFilesApi, sortedWorkspaceFiles, type ScaffoldDiscipline } from "./api.ts";
import type { Source } from "./access.ts";

// The three kinds of file Project Files shows, each behind one small adapter so the Explorer,
// the editor and the save path treat them identically - only this table knows which API serves
// which source.

export interface Location {
  epicKey: string;
  discipline: ScaffoldDiscipline;
  taskKey?: string;
}

export interface SourceFile {
  path: string;
}

export interface SourceMeta {
  label: string;
  // Accent colour for the section, its file icons and the editor's source badge (VS Code palette).
  color: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  list: (loc: Location) => Promise<SourceFile[]>;
  read: (loc: Location, path: string) => Promise<{ path: string; content: string }>;
  write: (loc: Location, path: string, content: string) => Promise<unknown>;
  // Short label for a file ("Architecture", "ADR", "Test Plan", "Spec"), or null for code.
  kindOf: (path: string) => string | null;
  // Shown while editing: what overwrites a hand edit later.
  overwrittenBy: string;
  emptyMessage: (loc: Location) => string;
}

export const SOURCES: Record<Source, SourceMeta> = {
  design: {
    label: "Architecture",
    color: "#c586c0",
    icon: DocumentIcon,
    list: async (loc) => sortedWorkspaceFiles((await designDocsApi.list(loc.epicKey)).files),
    read: (loc, path) => designDocsApi.read(loc.epicKey, path),
    write: (loc, path, content) => designDocsApi.write(loc.epicKey, path, content),
    kindOf: (path) => classifyWorkspaceFile(path).label,
    overwrittenBy: "the Architect agent revises this design again",
    emptyMessage: (loc) => `No design documents for ${loc.epicKey} yet (Gate 3).`,
  },
  qa: {
    label: "QA",
    color: "#e5c07b",
    icon: ClipboardCheckIcon,
    list: async (loc) => (await qaFilesApi.list(loc.epicKey)).files,
    read: (loc, path) => qaFilesApi.read(loc.epicKey, path),
    write: (loc, path, content) => qaFilesApi.write(loc.epicKey, path, content),
    kindOf: (path) => classifyQaFile(path).label,
    overwrittenBy: "the QA Agent (Gate 6) revises this Epic's test plan again",
    emptyMessage: (loc) => `No test plan for ${loc.epicKey} yet (Gate 6).`,
  },
  code: {
    label: "Code",
    color: "#3b8eea",
    icon: CodeIcon,
    list: async (loc) => (await devFilesApi.list(loc.epicKey, loc.discipline, loc.taskKey)).files,
    read: (loc, path) => devFilesApi.read(loc.epicKey, loc.discipline, path, loc.taskKey),
    write: (loc, path, content) => devFilesApi.write(loc.epicKey, loc.discipline, path, content, loc.taskKey),
    kindOf: () => null,
    overwrittenBy: "the Coding Agent (Gate 5) runs against this Task again",
    emptyMessage: (loc) => (loc.taskKey ? `No worktree for ${loc.taskKey} yet - has its Dev scaffold (Gate 4) run?` : `No ${loc.discipline} scaffold for ${loc.epicKey} yet (Gate 4).`),
  },
};

// Explorer order: design first, then the tests that check it, then the code.
export const SOURCE_ORDER: Source[] = ["design", "qa", "code"];
