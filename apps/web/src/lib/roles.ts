export const ROLES = [
  "admin",
  "project_owner",
  "business_analyst",
  "architect",
  "developer",
  "qa_engineer",
  "tester",
  "deployer",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  project_owner: "Project Owner",
  business_analyst: "Business Analyst",
  architect: "Architect",
  developer: "Developer",
  qa_engineer: "QA Engineer",
  tester: "Tester",
  deployer: "Deployer",
};
