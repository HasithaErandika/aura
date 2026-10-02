import { SETTINGS_CONTEXT_KEY, settingsFrom, type DataClass } from './settings';
import { turnRequestContext } from './turn-context';

// Which model providers may see a project's data (roadmap step 4.2). Code decides, per call, from
// the project's data class (Admin → Settings → Governance):
//   public        any configured provider, free tiers included
//   internal      providers under a contract (AURA_CONTRACTED_PROVIDERS)
//   confidential  contracted providers with zero data retention (AURA_ZERO_RETENTION_PROVIDERS)
// A call whose class no configured provider may serve is refused, never sent.

export const DEFAULT_DATA_CLASS: DataClass = 'public';

interface RequestContextLike {
  get: (key: string) => unknown;
}

const providers = (raw: string | undefined) => new Set((raw ?? '').split(',').map((p) => p.trim().toLowerCase()).filter(Boolean));

export interface ProviderTerms {
  contracted: ReadonlySet<string>;
  zeroRetention: ReadonlySet<string>;
}

export function providerTerms(env: NodeJS.ProcessEnv = process.env): ProviderTerms {
  const zeroRetention = providers(env.AURA_ZERO_RETENTION_PROVIDERS);
  // Zero retention is a stricter contract: those providers are contracted too.
  return { contracted: new Set([...providers(env.AURA_CONTRACTED_PROVIDERS), ...zeroRetention]), zeroRetention };
}

export const providerOf = (model: string) => (model.split('/')[0] ?? '').toLowerCase();

export function providerAllowed(provider: string, dataClass: DataClass, terms: ProviderTerms): boolean {
  if (dataClass === 'public') return true;
  if (dataClass === 'internal') return terms.contracted.has(provider);
  return terms.zeroRetention.has(provider);
}

export class ModelPolicyError extends Error {}

// The turn's data class: from the call's own request context, else the tool's turn.
export function dataClassFor(requestContext: RequestContextLike | undefined): DataClass {
  const direct = requestContext?.get(SETTINGS_CONTEXT_KEY) !== undefined ? requestContext : undefined;
  return settingsFrom(direct ?? turnRequestContext()).dataClass ?? DEFAULT_DATA_CLASS;
}

export function applyPolicy<T extends { model: string }>(chain: readonly T[], dataClass: DataClass, terms: ProviderTerms): (T & { enabled: boolean })[] {
  const entries = chain.map((entry) => ({ ...entry, enabled: providerAllowed(providerOf(entry.model), dataClass, terms) }));
  if (!entries.some((e) => e.enabled)) {
    const used = [...new Set(chain.map((e) => providerOf(e.model)))].join(', ');
    throw new ModelPolicyError(`Model policy: this project's data is "${dataClass}", which ${dataClass === 'internal' ? 'contracted' : 'zero-retention'} providers only may see, and none of this agent's providers (${used}) is one. Configure a contracted provider, or change the project's data class in Admin → Settings.`);
  }
  return entries;
}

// An agent's model list, filtered by the policy on every call.
export function governedModels<T extends { model: string }>(chain: readonly T[], terms: () => ProviderTerms = providerTerms) {
  return ({ requestContext }: { requestContext?: RequestContextLike }) => applyPolicy(chain, dataClassFor(requestContext), terms());
}
