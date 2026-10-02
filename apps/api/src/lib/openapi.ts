import { parse } from "yaml";

// The checks an Epic's OpenAPI contract must pass before it is saved (roadmap step 3.5). Coders
// build against it, QA scenarios name its operationIds, and CI checks the code against it, so a
// contract that does not parse or resolve is refused rather than stored.

const METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"] as const;
const OPERATION_ID = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;
const MAX_PROBLEMS = 20;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

function refs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => refs(n, out));
  else if (isObject(node)) {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") out.push(v);
      else refs(v, out);
    }
  }
  return out;
}

function resolves(doc: Json, ref: string): boolean {
  if (!ref.startsWith("#/")) return true; // external references are the contract owner's choice
  let node: unknown = doc;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isObject(node) || !(key in node)) return false;
    node = node[key];
  }
  return true;
}

export interface OpenApiCheck {
  problems: string[];
  operations: { operationId: string; method: string; path: string }[];
}

export function checkOpenApi(text: string): OpenApiCheck {
  const problems: string[] = [];
  const operations: OpenApiCheck["operations"] = [];
  let doc: unknown;
  try {
    doc = parse(text, { maxAliasCount: 50 });
  } catch (error) {
    return { problems: [`not valid YAML or JSON: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`], operations };
  }
  if (!isObject(doc)) return { problems: ["the contract must be a YAML or JSON object"], operations };
  if (typeof doc.openapi !== "string" || !/^3\.1\.\d+$/.test(doc.openapi)) problems.push('openapi must be "3.1.x"');
  const info = doc.info;
  if (!isObject(info) || typeof info.title !== "string" || typeof info.version !== "string") problems.push("info needs a title and a version");
  const paths = doc.paths;
  if (!isObject(paths) || Object.keys(paths).length === 0) problems.push("paths must list at least one endpoint");

  const seen = new Set<string>();
  for (const [path, item] of Object.entries(isObject(paths) ? paths : {})) {
    if (!path.startsWith("/")) problems.push(`path ${path} must start with /`);
    if (!isObject(item)) continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!isObject(op)) continue;
      const where = `${method.toUpperCase()} ${path}`;
      const id = op.operationId;
      if (typeof id !== "string" || !OPERATION_ID.test(id)) problems.push(`${where} needs an operationId (letters, digits, _)`);
      else if (seen.has(id)) problems.push(`operationId ${id} is used twice`);
      else {
        seen.add(id);
        operations.push({ operationId: id, method, path });
      }
      if (!isObject(op.responses) || Object.keys(op.responses).length === 0) problems.push(`${where} needs responses`);
    }
  }
  for (const ref of new Set(refs(doc))) if (!resolves(doc, ref)) problems.push(`$ref ${ref} does not resolve`);
  return { problems: problems.slice(0, MAX_PROBLEMS), operations };
}
