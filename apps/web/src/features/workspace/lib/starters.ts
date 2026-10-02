import type { Role } from "@/shared/lib/roles.ts";

export interface StarterInfo {
  guide: string;
  prompts: string[];
  placeholder: string;
}

const BY_ROLE: Partial<Record<Role, StarterInfo>> = {
  project_owner: {
    guide: "Turn an idea into an Epic. You approve it at Gate 1 before it reaches Jira.",
    prompts: ["Draft an Epic for a new customer feature", "Refine the acceptance criteria of an existing Epic"],
    placeholder: "Describe the feature or paste an Epic key",
  },
  business_analyst: {
    guide: "Break an approved Epic into stories. You approve them at Gate 2.",
    prompts: ["Break an Epic into user stories", "Tighten the acceptance criteria of a story"],
    placeholder: "Give an Epic key to break into stories",
  },
  architect: {
    guide: "Design the architecture for an Epic. You approve it at Gate 3.",
    prompts: ["Design the architecture for an Epic", "Draft ADRs for an Epic"],
    placeholder: "Give an Epic key to design",
  },
  qa_engineer: {
    guide: "Draft the test plan for an Epic and approve it before coding starts.",
    prompts: ["Draft a test plan for an Epic", "List missing test scenarios for an Epic"],
    placeholder: "Give an Epic key to plan tests for",
  },
  deployer: {
    guide: "Prepare the release plan for an Epic. You approve it at Gate 8.",
    prompts: ["Draft a release plan for an Epic", "Summarise what is ready to release"],
    placeholder: "Give an Epic key to plan the release",
  },
};

const DEFAULT_INFO: StarterInfo = {
  guide: "Brief the Orchestrator. It delegates to the right agent and pauses for people at every gate.",
  prompts: ["Brief the Orchestrator on a new feature", "Summarise the work waiting on a decision"],
  placeholder: "Message the Orchestrator",
};

export function starterInfo(role: Role, suggested: readonly string[] = []): StarterInfo {
  const base = BY_ROLE[role] ?? DEFAULT_INFO;
  const prompts = suggested.filter((p) => p.trim()).slice(0, 4);
  return { ...base, prompts: prompts.length ? prompts : base.prompts };
}
