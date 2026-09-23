// No "tester" role: qa_engineer owns Gate 6 and starts/oversees the bounded Tester Agent loop
// that replaced the old manual Gate 7 (see apps/agent-runtime's workflows/tester-workflow.ts).
export const ROLES = ["admin", "project_owner", "business_analyst", "architect", "developer", "qa_engineer", "deployer"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  project_owner: "Project Owner",
  business_analyst: "Business Analyst",
  architect: "Architect",
  developer: "Developer",
  qa_engineer: "QA Engineer",
  deployer: "Deployer",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Unassigned";
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}
