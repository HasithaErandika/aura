import { Fragment, type ReactNode } from "react";

// Renders the subset of Markdown the agents produce (headings, lists, bold, inline and
// fenced code, paragraphs) as React elements. No HTML is ever injected.

type Block =
  | { type: "code"; lang: string; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; text: string }
  | { type: "rule" };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (/^\s*```/.test(line)) {
      const lang = line.trim().slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? "")) {
        code.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", lang, text: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]!.length, text: heading[2] ?? "" });
      i += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        const m = ordered ? /^\s*\d+[.)]\s+(.*)$/.exec(current) : /^\s*[-*+]\s+(.*)$/.exec(current);
        if (m) {
          items.push(m[1] ?? "");
          i += 1;
        } else if (/^\s{2,}\S/.test(current) && items.length > 0) {
          items[items.length - 1] += ` ${current.trim()}`;
          i += 1;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (current.trim() === "" || /^\s*```/.test(current) || /^(#{1,6})\s+/.test(current) || /^\s*[-*+]\s+/.test(current) || /^\s*\d+[.)]\s+/.test(current)) break;
      para.push(current);
      i += 1;
    }
    blocks.push({ type: "paragraph", text: para.join("\n") });
  }
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(<Fragment key={key++}>{withBreaks(text.slice(last, match.index))}</Fragment>);
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key++} className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[0.85em] text-ink-800">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <strong key={key++} className="font-semibold text-ink-900">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(<Fragment key={key}>{withBreaks(text.slice(last))}</Fragment>);
  return nodes;
}

function withBreaks(text: string): ReactNode[] {
  const parts = text.split("\n");
  return parts.flatMap((part, idx) => (idx === 0 ? [part] : [<br key={`br-${idx}`} />, part]));
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className={className}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "code":
            return (
              <pre key={idx} className="my-3 overflow-x-auto rounded-lg border border-line bg-ink-50 p-3 font-mono text-[12.5px] leading-relaxed text-ink-800 whitespace-pre-wrap">
                {block.text}
              </pre>
            );
          case "heading": {
            const cls = block.level <= 2 ? "mt-4 mb-1.5 text-base font-semibold text-ink-900" : "mt-3 mb-1 text-sm font-semibold text-ink-900";
            return (
              <p key={idx} className={cls}>
                {renderInline(block.text)}
              </p>
            );
          }
          case "list":
            return block.ordered ? (
              <ol key={idx} className="my-2 list-decimal space-y-1 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            ) : (
              <ul key={idx} className="my-2 list-disc space-y-1 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "rule":
            return <hr key={idx} className="my-3 border-line" />;
          case "paragraph":
            return (
              <p key={idx} className="my-2 leading-relaxed">
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
