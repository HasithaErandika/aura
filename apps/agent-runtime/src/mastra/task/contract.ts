import type { BridgeCaller } from '../bridge/client';
import { designDocs as defaultClient, type DesignDocsClient } from '../lib/design-docs-client';

// Gate 6 commits the Epic's approved API contract with the Task's change (roadmap step 3.5), so CI
// checks the code against the same contract coders and QA used.
export const CONTRACT_PATH = 'contracts/openapi.yaml';

export async function writeContract(bridge: Pick<BridgeCaller, 'call'>, epicKey: string | null, client: DesignDocsClient = defaultClient): Promise<boolean> {
  if (!epicKey) return false;
  const [doc] = await client.list(epicKey, ['openapi']);
  if (!doc) return false;
  const { content } = await client.read(doc.id);
  await bridge.call('fs.writeFile', { path: CONTRACT_PATH, content, overwrite: true });
  return true;
}
