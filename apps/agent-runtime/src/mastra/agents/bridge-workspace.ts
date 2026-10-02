import { Workspace } from '@mastra/core/workspace';
import { runFrom } from '../gateway/context';
import { bridgeCaller, type BridgeCaller } from '../bridge/client';
import { BridgeFilesystem, BridgeSandbox } from '../bridge/workspace';

// A Mastra Workspace on the developer's VS Code (ADR-4), resolved per run from the request
// context apps/api sends, so each run reaches the VS Code of the developer who started it.
// `readOnly` (checked on every call) makes the extension answer as in plan mode. A coder working
// on a parallel sub-task gets `auraWorktree` in its request context, so it reaches that worktree.

type RequestContextLike = { get: (key: string) => unknown };
export type ReadOnlyCheck = (requestContext: RequestContextLike) => () => Promise<boolean>;

export function runIdOf(requestContext: RequestContextLike): string {
  const run = runFrom(requestContext);
  if (!run) throw new Error('This agent needs an AURA run (it is reached through apps/api only)');
  return run.runId;
}

export const WORKTREE_KEY = 'auraWorktree';

export function worktreeOf(requestContext: RequestContextLike): string | undefined {
  const w = requestContext.get(WORKTREE_KEY);
  return typeof w === 'string' && w ? w : undefined;
}

export function bridgeFor(requestContext: RequestContextLike, readOnly?: ReadOnlyCheck): BridgeCaller {
  return bridgeCaller(runIdOf(requestContext), fetch, { ...(readOnly ? { readOnly: readOnly(requestContext) } : {}), worktree: worktreeOf(requestContext) });
}

// One sandbox per run, and per worktree within it (parallel coders must not share one).
function scopeKey(requestContext: RequestContextLike): string {
  const worktree = worktreeOf(requestContext);
  return worktree ? `${runIdOf(requestContext)}:${worktree}` : runIdOf(requestContext);
}

export function bridgeWorkspace(id: string, name: string, readOnly?: ReadOnlyCheck): Workspace {
  return new Workspace({
    id,
    name,
    filesystem: ({ requestContext }) => new BridgeFilesystem(bridgeFor(requestContext, readOnly), scopeKey(requestContext)),
    sandbox: ({ requestContext }) => new BridgeSandbox(bridgeFor(requestContext, readOnly), scopeKey(requestContext)),
    sandboxCacheKey: ({ requestContext }) => (runFrom(requestContext) ? scopeKey(requestContext) : undefined),
  });
}
