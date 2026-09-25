import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";

// Terminal output helpers. Colors only when writing to a real terminal and NO_COLOR is unset
// (https://no-color.org), so piped output and `--json` stay clean.

const useColor = stdout.isTTY && !process.env.NO_COLOR;
const wrap = (open: number, close: number) => (text: string) => (useColor ? `\u001b[${open}m${text}\u001b[${close}m` : text);

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

export function out(text = ""): void {
  stdout.write(`${text}\n`);
}

export function write(text: string): void {
  stdout.write(text);
}

export function err(text: string): void {
  stderr.write(`${c.red("error")} ${text}\n`);
}

export function warn(text: string): void {
  stderr.write(`${c.yellow("warn")} ${text}\n`);
}

export function json(value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function ask(question: string, opts: { secret?: boolean } = {}): Promise<string> {
  if (!stdin.isTTY) throw new Error(`${question.trim()} - no terminal to prompt on; pass it as an option instead`);
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (opts.secret) {
    // Mask typed characters: readline echoes through _writeToOutput, which is replaced here.
    const internal = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    internal._writeToOutput = (s: string) => {
      if (s.startsWith(question)) internal.output.write(question);
      else if (s === "\r\n" || s === "\n") internal.output.write(s);
      else internal.output.write("*".repeat(s.length));
    };
  }
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
    if (opts.secret) stdout.write("\n");
  }
}

export function indent(text: string, prefix = "  "): string {
  return text
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}

export function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("done") || s.includes("succeed") || s.includes("approved")) return c.green(status);
  if (s.includes("progress") || s.includes("review") || s.includes("running") || s.includes("pending") || s.includes("suspended")) return c.yellow(status);
  if (s.includes("fail") || s.includes("reject") || s.includes("block")) return c.red(status);
  return status;
}
