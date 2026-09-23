// Mirrors docs/ARCHITECTURE.md section 4.2 (roles) and the `user_role` enum in
// supabase/migrations/0001_identity.sql (narrowed by 0005_remove_tester_role.sql). Keep the
// three in sync. There is no "tester" role: qa_engineer owns Gate 6 and starts/oversees the
// bounded Tester Agent loop that replaced the old manual Gate 7 (workflows/tester-workflow.ts).
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

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
