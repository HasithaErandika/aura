import { useMemo, useState } from "react";
import { ChevronRightIcon, CodeIcon, TreeIcon } from "../icons/index.tsx";
import { cn } from "../lib/cn.ts";
import { vscode } from "../lib/vscodeTheme.ts";

export interface TreeFile {
  path: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children: TreeNode[];
}

// Builds a nested folder/file tree from the flat list the API returns (VS Code's own Explorer
// shape) - folders before files, alphabetical within each, so it reads the same way VS Code's
// does rather than a flat list of full paths that makes nesting hard to see at a glance. Shared
// across any read-only file viewer (Project Files, QA Files) - it only ever needs a path.
function buildTree(files: TreeFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    let level = root;
    let currentPath = "";
    parts.forEach((part, i) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;
      let node = level.find((n) => n.name === part && n.type === (isFile ? "file" : "folder"));
      if (!node) {
        node = { name: part, path: currentPath, type: isFile ? "file" : "folder", children: [] };
        level.push(node);
      }
      level = node.children;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root);
  return root;
}

function allFolderPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const n of nodes) {
    if (n.type === "folder") {
      paths.push(n.path);
      paths.push(...allFolderPaths(n.children));
    }
  }
  return paths;
}

export function FileTree({ files, selectedPath, onSelect, emptyMessage }: { files: TreeFile[]; selectedPath: string | null; onSelect: (path: string) => void; emptyMessage?: string }) {
  const tree = useMemo(() => buildTree(files), [files]);
  // Small scaffolded projects read best fully expanded, VS Code style for a project you just
  // opened - remounting this component (parent keys it by epic+discipline) resets this on reload.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(allFolderPaths(tree)));

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNode(node: TreeNode, depth: number) {
    const indent = 10 + depth * 14;
    if (node.type === "folder") {
      const isOpen = expanded.has(node.path);
      return (
        <li key={node.path}>
          <button
            type="button"
            onClick={() => toggle(node.path)}
            style={{ paddingLeft: indent, color: vscode.text }}
            className="flex w-full items-center gap-1 rounded py-1 pr-2 text-left text-xs font-medium hover:brightness-125"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = vscode.hoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <ChevronRightIcon className={cn("size-3.5 shrink-0 transition-transform", isOpen && "rotate-90")} style={{ color: vscode.mutedText }} />
            <TreeIcon className="size-3.5 shrink-0" style={{ color: vscode.mutedText }} />
            <span className="truncate">{node.name}</span>
          </button>
          {isOpen ? <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul> : null}
        </li>
      );
    }
    const isSelected = selectedPath === node.path;
    return (
      <li key={node.path}>
        <button
          type="button"
          onClick={() => onSelect(node.path)}
          style={{ paddingLeft: indent + 18, backgroundColor: isSelected ? vscode.selectedBg : "transparent", color: isSelected ? vscode.selectedText : vscode.text }}
          className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-xs"
          onMouseEnter={(e) => !isSelected && (e.currentTarget.style.backgroundColor = vscode.hoverBg)}
          onMouseLeave={(e) => !isSelected && (e.currentTarget.style.backgroundColor = "transparent")}
          title={node.path}
        >
          <CodeIcon className="size-3.5 shrink-0" style={{ color: isSelected ? vscode.accent : vscode.mutedText }} />
          <span className="truncate">{node.name}</span>
        </button>
      </li>
    );
  }

  if (tree.length === 0) return <p className="px-2 py-1.5 text-xs" style={{ color: vscode.mutedText }}>{emptyMessage ?? "No files found."}</p>;
  return <ul className="text-sm">{tree.map((node) => renderNode(node, 0))}</ul>;
}
