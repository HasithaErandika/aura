import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bvi\.mock\s*\(\s*)["']([^"']+)["']/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

const posix = (path: string) => path.split(sep).join("/");

const imports = sourceFiles(SRC).flatMap((file) => {
  const from = posix(relative(SRC, file));
  return [...readFileSync(file, "utf8").matchAll(SPECIFIER)]
    .map((m) => m[1]!)
    .filter((spec) => spec.startsWith("."))
    .map((spec) => ({ from, to: posix(relative(SRC, resolve(dirname(file), spec))) }));
});

const moduleOf = (path: string) => /^modules\/([^/]+)\//.exec(path)?.[1] ?? null;

describe("module boundaries", () => {
  it("reaches another module only through its index", () => {
    const deep = imports.filter(({ from, to }) => {
      const target = moduleOf(to);
      return target !== null && target !== moduleOf(from) && !/^modules\/[^/]+\/index\.(js|ts)$/.test(to);
    });
    expect(deep.map(({ from, to }) => `${from} -> ${to}`)).toEqual([]);
  });

  it("keeps lib independent of modules, middleware and routes", () => {
    const upward = imports.filter(({ from, to }) => from.startsWith("lib/") && /^(modules|middleware|routes)\//.test(to));
    expect(upward.map(({ from, to }) => `${from} -> ${to}`)).toEqual([]);
  });

  it("finds the imports it checks", () => {
    expect(imports.some(({ to }) => to === "modules/policy/index.js")).toBe(true);
  });
});
