// Human notes for a Coding Council run (`aura say`, the web Council panel), keyed by the coding
// draft id. In memory on purpose: a note only matters to the next round of a run happening in
// this process right now, and the council copies every note it uses into its transcript, so
// nothing is lost to history when the process restarts.

const MAX_NOTES = 20;
const MAX_NOTE_CHARS = 2000;
const queues = new Map<string, string[]>();

export function addCouncilNote(draftId: string, text: string): number {
  const queue = queues.get(draftId) ?? [];
  if (queue.length >= MAX_NOTES) throw new Error(`Too many pending notes for ${draftId} (max ${MAX_NOTES})`);
  queue.push(text.slice(0, MAX_NOTE_CHARS));
  queues.set(draftId, queue);
  return queue.length;
}

// Returns and clears the pending notes - each note is delivered to exactly one agent turn.
export function takeCouncilNotes(draftId: string): string[] {
  const queue = queues.get(draftId) ?? [];
  queues.delete(draftId);
  return queue;
}
