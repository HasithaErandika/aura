import type { Me } from "../../types/api.ts";

// Who can see and change what on Project Files - the one place the page decides it. Every rule
// is derived from the agent grants the API returns for the signed-in role (GET /me), mirroring
// the API's own policy checks (apps/api modules/policy/policy.ts), so the page never offers
// something the server would refuse and a grant change there flows through here unedited:
//
//                 Design docs      QA plan/specs  Test runs  Code   Terminal  Runners
//   PO            read + comment   -              -          -      -         -
//   BA            read + comment   read           read       -      -         -
//   Architect     edit + comment   read           read       read   -         read
//   Developer     read             read           read       edit   yes       read
//   QA Engineer   read             edit           read       read   -         read
//   Deployer      read             read           read       -      -         -
//   Admin         read             read           read       read   -         read
//
// Actions: Run CI (Developer, QA), Run tests (QA - runs the Tester Agent), Code this Task
// (Developer - starts Gate 5).

export type Source = "design" | "qa" | "code";
export type PanelTab = "terminal" | "tests" | "runners";

export interface ProjectFilesAccess {
  see: Record<Source, boolean>;
  edit: Record<Source, boolean>;
  commentOnDesign: boolean;
  terminal: boolean;
  testRuns: boolean;
  runners: boolean;
  runCi: boolean;
  runTests: boolean;
  codeTask: boolean;
  // Which Explorer section starts open, and which bottom-panel tab starts active, for this role.
  defaultSection: Source;
  panelTabs: PanelTab[];
  defaultTab: PanelTab | null;
}

export function projectFilesAccess(me: Me | null): ProjectFilesAccess {
  const grants = me?.grants.agents ?? {};
  const admin = me?.role === "admin";
  const reads = (agent: string) => admin || Boolean(grants[agent]);
  const runs = (agent: string) => grants[agent] === "run";

  const see = { design: admin || Object.keys(grants).length > 0, qa: reads("qa-agent"), code: reads("dev-agent") };
  const edit = { design: runs("architect-agent"), qa: runs("qa-agent"), code: runs("dev-agent") };

  const terminal = edit.code;
  const testRuns = see.qa;
  const runners = see.code;
  const panelTabs = [terminal && "terminal", testRuns && "tests", runners && "runners"].filter(Boolean) as PanelTab[];

  const defaultSection: Source = edit.code ? "code" : edit.qa ? "qa" : see.design ? "design" : see.qa ? "qa" : "code";
  const defaultTab: PanelTab | null = terminal ? "terminal" : edit.qa && testRuns ? "tests" : (panelTabs[0] ?? null);

  return {
    see,
    edit,
    // The design authors review the design: whoever runs an agent up to and including Gate 3.
    commentOnDesign: runs("po-agent") || runs("ba-agent") || runs("architect-agent"),
    terminal,
    testRuns,
    runners,
    runCi: edit.code || edit.qa,
    runTests: runs("tester-agent"),
    codeTask: runs("coding-agent"),
    defaultSection,
    panelTabs,
    defaultTab,
  };
}
