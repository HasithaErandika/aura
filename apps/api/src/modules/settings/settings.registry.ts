import { z, type ZodTypeAny } from "zod";
import { env } from "../../config/env.js";

// Every setting the dashboard can change. Unlisted keys cannot be stored; secrets never belong here.
// owner "api" is read here; owner "runtime" is sent with each turn and re-checked by the runtime.
// cap: a user value can never exceed the shared value.

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
  // Used when nothing is set at any scope.
  fallback: () => SettingValue;
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

// Runtime bounds match apps/agent-runtime config/settings.ts parseDashboardSettings().
export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: "vscode.evaluatorRounds",
    group: "agents",
    label: "VS Code review rounds",
    description: "In VS Code, how many coder → Evaluator rounds a Task gets before the code goes to you for review anyway.",
    owner: "runtime",
    scopes: ANY,
    ...integer(1, 5),
    fallback: () => 3,
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
    key: "governance.vscodeModes",
    group: "governance",
    label: "VS Code permission modes",
    description: "Which modes developers may pick in AURA for VS Code. all: plan, default and accept edits. no-accept-edits: every file change asks. plan-only: agents read and propose only.",
    owner: "api",
    scopes: SHARED,
    ...choice(["all", "no-accept-edits", "plan-only"]),
    fallback: () => "all",
  },
  {
    key: "limits.turnTimeoutMinutes",
    group: "limits",
    label: "Agent turn time limit",
    description: "One agent turn is stopped after this long.",
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
