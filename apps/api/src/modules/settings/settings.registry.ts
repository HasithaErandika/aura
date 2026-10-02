import { z, type ZodTypeAny } from "zod";
import { env } from "../../config/env.js";

// Unlisted keys cannot be stored; secrets never belong here.

export const SETTING_SCOPES = ["global", "project", "user"] as const;
export type SettingScope = (typeof SETTING_SCOPES)[number];

type SettingGroup = "agents" | "governance" | "jira" | "limits";

export type SettingValue = string | number | boolean;

export interface SettingDefinition {
  key: string;
  group: SettingGroup;
  label: string;
  description: string;
  owner: "api" | "runtime";
  scopes: readonly SettingScope[];
  schema: ZodTypeAny;
  fallback: () => SettingValue;
  input: { type: "enum"; options: readonly string[] } | { type: "integer"; min: number; max: number; unit?: string } | { type: "text"; maxLength: number };
  // A capped user value can never exceed the shared value.
  cap?: boolean;
}

function integer(min: number, max: number, unit?: string) {
  return { schema: z.number().int().min(min).max(max), input: { type: "integer" as const, min, max, unit } };
}

function text(maxLength: number) {
  return { schema: z.string().trim().min(1).max(maxLength), input: { type: "text" as const, maxLength } };
}

function choice<const T extends readonly [string, ...string[]]>(options: T) {
  return { schema: z.enum(options), input: { type: "enum" as const, options } };
}

const SHARED: readonly SettingScope[] = ["global", "project"];
const ANY: readonly SettingScope[] = ["global", "project", "user"];

// Exact Jira status names; "none" skips that move. A name the workflow can't reach is logged, never invented.
function jiraStatus(key: string, label: string, description: string, fallback: string): SettingDefinition[] {
  return [{ key, group: "jira", label, description: `${description} Use the exact status name from your Jira workflow, or none to skip.`, owner: "api", scopes: SHARED, ...text(60), fallback: () => fallback }];
}

// Runtime bounds must match agent-runtime config/settings.ts.
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
  ...jiraStatus("jira.statusInProgress", "Status when work starts", "The Jira status a Task moves to when its plan is approved at Gate 4 and work starts on its branch.", "In Progress"),
  ...jiraStatus("jira.statusInReview", "Status when the PR opens", "The Jira status a Task moves to when its pull request opens.", "In Review"),
  ...jiraStatus("jira.statusReadyForRelease", "Status when the PR merges", "The Jira status a Task moves to when a person merges its pull request.", "Ready for Release"),
  ...jiraStatus("jira.statusDone", "Status when released", "The Jira status an Epic's Tasks move to when its release plan is approved at Gate 8.", "Done"),
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
