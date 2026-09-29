import path from 'node:path';
import { AURA_WORKSPACE_ROOT } from '../workspace/root';
import { LocalGitProvider } from './local-provider';
import { GitProviderError, type GitProvider, type GitProviderKind } from './provider';

export * from './provider';
export { LocalGitProvider } from './local-provider';

// Where the `local` provider keeps its bare repositories. Default: <AURA_WORKSPACE_ROOT>/.remotes.
export const AURA_GIT_LOCAL_ROOT = path.resolve(AURA_WORKSPACE_ROOT, process.env.AURA_GIT_LOCAL_ROOT || '.remotes');

let local: LocalGitProvider | null = null;

// The provider for a registered repository (apps/api `repositories.provider`).
export function gitProvider(kind: GitProviderKind): GitProvider {
  if (kind === 'local') return (local ??= new LocalGitProvider(AURA_GIT_LOCAL_ROOT));
  // Phase 1.2b: GitHub App auth (short-lived installation tokens), run against the same contract.
  throw new GitProviderError('The GitHub provider is not built yet; register the repository with provider "local" for now', 'invalid');
}
