import type { AuthedUser } from "../../lib/auth/user.js";
import { conflict, forbidden, notFound } from "../../lib/http/errors.js";
import { peopleById } from "../identity/index.js";
import { agentsApprovedByRole, canNoteRun, canViewRun } from "../policy/index.js";
import { runNotesRepository } from "./run-notes.repository.js";
import { runsRepository } from "./runs.repository.js";
import { ACTIVE_RUN_STATUSES, toRunView, type RunNote, type RunRow, type RunStatus, type RunView } from "./runs.types.js";

export async function requireRun(id: string): Promise<RunRow> {
  const run = await runsRepository.findById(id);
  if (!run) throw notFound("Run");
  return run;
}

function viewerCanSee(user: AuthedUser, run: RunRow): boolean {
  return canViewRun(user, { requestedBy: run.requested_by, currentAgent: run.current_agent });
}

export async function requireViewableRun(id: string, user: AuthedUser): Promise<RunRow> {
  const run = await requireRun(id);
  if (!viewerCanSee(user, run)) throw forbidden("You cannot view this run");
  return run;
}

export async function runViews(rows: RunRow[]): Promise<RunView[]> {
  const person = await peopleById(rows.map((r) => r.requested_by));
  return rows.map((row) => toRunView(row, person(row.requested_by)));
}

export function listRunsFor(user: AuthedUser, filter: { status?: RunStatus[]; limit: number }): Promise<RunRow[]> {
  return user.role === "admin" ? runsRepository.list(filter) : runsRepository.listVisibleTo(user.id, agentsApprovedByRole(user.role), filter);
}

export function assertCanAddNote(run: RunRow, user: AuthedUser): void {
  if (!canNoteRun(user, { requestedBy: run.requested_by })) throw forbidden("Only the developer who started this run can add notes to it");
  if (!ACTIVE_RUN_STATUSES.includes(run.status)) throw conflict("This run has finished; send a message instead");
}

export function addRunNote(runId: string, authorId: string, text: string): Promise<RunNote> {
  return runNotesRepository.add(runId, authorId, text);
}

export function takeRunNotes(runId: string): Promise<RunNote[]> {
  return runNotesRepository.take(runId);
}
