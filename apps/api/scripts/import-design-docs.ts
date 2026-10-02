// One-off import of the design documents written to disk before V3 (Gate 3's architecture
// Markdown and Gate 6's test plan under .workspaces/<EPIC>/) into Postgres (design_documents).
// Safe to run again: a document whose content did not change gets no new version.
//
// Usage:
//   pnpm --filter api import-design-docs -- [--root ../../.workspaces] [--epic KAN-36] [--dry-run]
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in apps/api/.env.

import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { planImport, type WorkspaceFile } from "../src/modules/design-docs/import-plan.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function markdownUnder(dir: string, base: string): Promise<WorkspaceFile[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: WorkspaceFile[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownUnder(full, base)));
    else if (entry.name.endsWith(".md")) files.push({ path: path.relative(base, full).split(path.sep).join("/"), content: await readFile(full, "utf8") });
  }
  return files;
}

async function main() {
  const root = path.resolve(arg("root") ?? path.join(import.meta.dirname, "../../../.workspaces"));
  const only = arg("epic")?.toUpperCase();
  const dryRun = process.argv.includes("--dry-run");
  const epics = (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory() && /^[A-Z][A-Z0-9_]*-\d+$/.test(e.name)).map((e) => e.name);
  // Loaded only for a real run, so --dry-run works without database credentials.
  const writeFromAgent = dryRun ? null : (await import("../src/modules/design-docs/design-docs.service.js")).writeFromAgent;

  for (const epicKey of epics.filter((e) => !only || e === only)) {
    const base = path.join(root, epicKey);
    const files = [...(await markdownUnder(path.join(base, "architecture"), base)), ...(await markdownUnder(path.join(base, "qa"), base))];
    const { writes, skipped } = planImport(epicKey, files);
    for (const write of writes) {
      if (!writeFromAgent) {
        console.log(`${epicKey}  ${write.kind.padEnd(12)} ${write.slug}  (dry run)`);
        continue;
      }
      const saved = await writeFromAgent(write);
      console.log(`${epicKey}  ${write.kind.padEnd(12)} ${write.slug}  ${saved.created ? "created" : saved.changed ? `version ${saved.document.currentVersion}` : "unchanged"}`);
    }
    for (const file of skipped) console.log(`${epicKey}  skipped      ${file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
