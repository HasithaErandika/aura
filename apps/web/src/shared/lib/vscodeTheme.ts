// VS Code's own Dark+ palette, reused wherever a page wants to look like VS Code (Design
// Documents, Scaffolded Project Files) - both the editor pane (via @uiw/codemirror-theme-vscode)
// and the surrounding chrome (explorer sidebar, tab bar) should match, not just the text inside
// the editor.
export const vscode = {
  sidebarBg: "#252526",
  editorBg: "#1e1e1e",
  tabBarBg: "#252526",
  activeTabBg: "#1e1e1e",
  border: "#3c3c3c",
  text: "#cccccc",
  mutedText: "#8a8a8a",
  hoverBg: "#2a2d2e",
  selectedBg: "#37373d",
  selectedText: "#ffffff",
  accent: "#3b82f6",
} as const;
