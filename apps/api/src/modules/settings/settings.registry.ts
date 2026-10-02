import { z, type ZodTypeAny } from "zod";
import { env } from "../../config/env.js";

// Every setting the dashboard can change (docs/plans/aura-automation-durability.md Part A). A key
// that isn't listed here can't be stored, so adding one is a code change with a review, never a
// free-form value. Secrets never belong here.
//
// owner "api":     read by apps/api itself; fallback is this app's .env value.
// owner "runtime": sent to apps/agent-runtime with every turn (requestContext auraSettings);
//                  only values set in the dashboard are sent, so the runtime's own .env and code
//                  defaults still apply to everything else. The runtime re-checks the bounds.
// cap: a user value can't exceed the project/global value (a personal limit, never an increase).

export const SETTING_SCOPES = ["global", "project", "user"] as const;
export type SettingScope = (typeof SETTING_SCOPES)[number];

export const SETTING_GROUPS = ["agents", "governance", "limits"] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

export type SettingValue = string | number | boolean;

export interface SettingDefinition {
  key: string;
  group: SettingGroup;
  label: string;
  description: string;
  owner: "api" | "runtime";
  scopes: readonly SettingScope[];
  schema: ZodTypeAny;
  // The value used when nothing is set at any scope (for owner "runtime": the code default; the
  // runtime's .env can still override it).
  fallback: () => SettingValue;
  // For the UI: allowed values or numeric bounds.
  input: { type: "enum"; options: readonly string[] } | { type: "integer"; min: number; max: number; unit?: string };
  cap?: boolean;
}

function integer(min: number, max: number, unit?: string) {
  return { schema: z.number().int().min(min).max(max), input: { type: "integer" as const, min, max, unit } };
}

function choice<const T extends readonly [string, ...string[]]>(options: T) {
  return { schema: z.enum(options), input: { type: "enum" as const, options } };
}

const SHARED: readonly SettingScope[] = ["global", "project"];
const ANY: readonly SettingScope[] = ["global", "project", "user"];

// Bounds match apps/agent-runtime workflows/coding-council.ts councilSettings().
export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: "council.mode",
    group: "agents",
    label: "Coding Council mode",
    description: "lean: the Implementer plans inline. full: separate Planner and plan review. auto: full for sensitive or large Tasks.",
    owner: "runtime",
    scopes: ANY,
    ...choice(["auto", "lean", "full"]),
    fallback: () => "auto",
  },
  {
    key: "council.planRounds",
    group: "agents",
    label: "Plan review rounds",
    description: "How many times the Reviewer critiques the plan (full mode). 0 skips the plan review.",
    owner: "runtime",
    scopes: SHARED,
    ...integer(0, 3),
    fallback: () => 1,
  },
  {
    key: "council.maxRounds",
    group: "agents",
    label: "Code review rounds",
    description: "Maximum review → fix rounds before the council stops.",
    owner: "runtime",
    scopes: SHARED,
    ...integer(1, 5),
    fallback: () => 2,
  },
  {
    key: "council.implementerSteps",
    group: "agents",
    label: "Implementer steps",
    description: "Tool steps the Implementer may take for the first build.",
    owner: "runtime",
    scopes: SHARED,
    ...integer(3, 40),
    fallback: () => 15,
  },
  {
    key: "council.fixSteps",
    group: "agents",
    label: "Fix steps per round",
    description: "Tool steps the Implementer may take to fix review findings.",
    owner: "runtime",
    scopes: SHARED,
    ...integer(2, 30),
    fallback: () => 8,
  },
  {
    key: "council.tokenBudget",
    group: "agents",
    label: "Token budget per council run",
    description: "The council stops cleanly at this many tokens and keeps the work so far.",
    owner: "runtime",
    scopes: ANY,
    ...integer(10_000, 5_000_000, "tokens"),
    fallback: () => 150_000,
    cap: true,
  },
  {
    key: "governance.approvalSlaHours",
    group: "governance",
    label: "Approval expiry",
    description: "A gate nobody decides within this time expires. It is never approved automatically.",
    owner: "api",
    scopes: SHARED,
    ...integer(1, 720, "hours"),
    fallback: () => env.approvalSlaHours,
  },
  {
    key: "governance.injectionPolicy",
    group: "governance",
    label: "Prompt-injection policy",
    description: "warn: show findings on the draft. block: withhold a draft with a high-severity finding.",
    owner: "runtime",
    scopes: SHARED,
    ...choice(["warn", "block"]),
    fallback: () => "warn",
  },
  {
    key: "limits.turnTimeoutMinutes",
    group: "limits",
    label: "Agent turn time limit",
    description: "One agent turn (including a whole council run) is stopped after this long.",
    owner: "api",
    scopes: ["global"],
    ...integer(1, 180, "minutes"),
    fallback: () => Math.max(1, Math.round(env.runTurnTimeoutMs / 60_000)),
  },
];

const BY_KEY = new Map(SETTING_DEFINITIONS.map((d) => [d.key, d]));

export function settingDefinition(key: string): SettingDefinition | undefined {
  return BY_KEY.get(key);
}
