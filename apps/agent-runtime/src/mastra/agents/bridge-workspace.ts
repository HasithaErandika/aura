import { Workspace } from '@mastra/core/workspace';
import { runFrom } from '../gateway/context';
import { bridgeCaller, type BridgeCaller } from '../bridge/client';
import { BridgeFilesystem, BridgeSandbox } from '../bridge/workspace';

// A Mastra Workspace on the developer's VS Code (ADR-4), resolved per run from the request
// context apps/api sends, so each run reaches the VS Code of the developer who started it.
// `readOnly` (checked on every call) makes the extension answer as in plan mode.

type RequestContextLike = { get: (key: string) => unknown };
export type ReadOnlyCheck = (requestContext: RequestContextLike) => () => Promise<boolean>;

export function runIdOf(requestContext: RequestContextLike): string {
  const run = runFrom(requestContext);
  if (!run) throw new Error('This agent needs an AURA run (it is reached through apps/api only)');
  return run.runId;
}

export function bridgeFor(requestContext: RequestContextLike, readOnly?: ReadOnlyCheck): BridgeCaller {
  return bridgeCaller(runIdOf(requestContext), fetch, readOnly ? { readOnly: readOnly(requestContext) } : {});
}

export function bridgeWorkspace(id: string, name: string, readOnly?: ReadOnlyCheck): Workspace {
  return new Workspace({
    id,
    name,
    filesystem: ({ requestContext }) => new BridgeFilesystem(bridgeFor(requestContext, readOnly), runIdOf(requestContext)),
    sandbox: ({ requestContext }) => new BridgeSandbox(bridgeFor(requestContext, readOnly), runIdOf(requestContext)),
    sandboxCacheKey: ({ requestContext }) => runFrom(requestContext)?.runId,
  });
}
