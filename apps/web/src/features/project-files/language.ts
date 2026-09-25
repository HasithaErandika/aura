import type { Extension } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";

// Picks a CodeMirror language extension by file extension - covers what Gate 4's scaffolds
// actually produce (Vite/React/NestJS: ts, tsx, js, jsx, json, css, html) plus Markdown for docs.
// An unrecognized extension gets no language extension - CodeMirror still renders it as plain
// text with line numbers, it just skips highlighting rather than guessing wrong.
export function languageExtension(path: string): Extension[] {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return [javascript({ jsx: true })];
    case "json":
      return [json()];
    case "css":
      return [css()];
    case "html":
      return [html()];
    case "md":
      return [markdown()];
    default:
      return [];
  }
}
