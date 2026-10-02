import type { Role } from "../../lib/auth/roles.js";
import type { Person, ProfileSummary } from "./identity.types.js";
import { profilesRepository } from "./profiles.repository.js";

export type PersonLookup = (id: string | null | undefined) => Person | null;

async function profilesById(ids: (string | null | undefined)[]): Promise<Map<string, ProfileSummary>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const profiles = await profilesRepository.byIds(unique);
  return new Map(profiles.map((p) => [p.id, p]));
}

function personLookup(profiles: Map<string, ProfileSummary>): PersonLookup {
  return (id) => {
    const profile = id ? profiles.get(id) : undefined;
    return profile ? { fullName: profile.fullName, email: profile.email } : null;
  };
}

export async function peopleById(ids: (string | null | undefined)[]): Promise<PersonLookup> {
  return personLookup(await profilesById(ids));
}

export function userIdsWithRole(role: Role): Promise<string[]> {
  return profilesRepository.idsWithRole(role);
}

// The developer with this email, for a Jira assignee (case-insensitive).
export function developerIdByEmail(email: string): Promise<string | null> {
  return profilesRepository.idWithEmailAndRole(email.replace(/[%_\\]/g, ""), "developer");
}
