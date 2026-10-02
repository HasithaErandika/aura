// Matches the `user_role` enum (migrations 0001 and 0005) and docs/ARCHITECTURE.md roles.
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
