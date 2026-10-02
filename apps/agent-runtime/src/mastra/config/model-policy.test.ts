import { describe, expect, it } from 'vitest';
import { applyPolicy, dataClassFor, governedModels, ModelPolicyError, providerAllowed, providerTerms } from './model-policy';
import { parseDashboardSettings, SETTINGS_CONTEXT_KEY } from './settings';
import { noteModel, withTurnContext } from './turn-context';
import { withGeminiFallback } from './models';

const ctx = (settings: Record<string, unknown> | undefined) => ({ get: (key: string) => (key === SETTINGS_CONTEXT_KEY ? settings : undefined) });
const chain = withGeminiFallback('groq/openai/gpt-oss-120b');
const terms = providerTerms({ AURA_CONTRACTED_PROVIDERS: 'Anthropic, openai', AURA_ZERO_RETENTION_PROVIDERS: 'anthropic' });

describe('model policy (step 4.2)', () => {
  it('reads contracted and zero-retention providers; zero retention implies a contract', () => {
    expect([...terms.contracted].sort()).toEqual(['anthropic', 'openai']);
    expect([...providerTerms({ AURA_ZERO_RETENTION_PROVIDERS: 'anthropic' }).contracted]).toEqual(['anthropic']);
    expect(providerTerms({}).contracted.size).toBe(0);
  });

  it('lets public data use any provider, internal only contracted, confidential only zero retention', () => {
    expect(providerAllowed('groq', 'public', terms)).toBe(true);
    expect(providerAllowed('groq', 'internal', terms)).toBe(false);
    expect(providerAllowed('openai', 'internal', terms)).toBe(true);
    expect(providerAllowed('openai', 'confidential', terms)).toBe(false);
    expect(providerAllowed('anthropic', 'confidential', terms)).toBe(true);
  });

  it('switches off the providers a project may not use and keeps the fallback order', () => {
    const mixed = [{ model: 'groq/x' }, { model: 'anthropic/claude' }, { model: 'google/gemini' }];
    expect(applyPolicy(mixed, 'internal', terms).map((e) => [e.model, e.enabled])).toEqual([['groq/x', false], ['anthropic/claude', true], ['google/gemini', false]]);
    expect(applyPolicy(chain, 'public', terms).every((e) => e.enabled)).toBe(true);
  });

  it('refuses the call when no provider of the agent may see the data', () => {
    expect(() => applyPolicy(chain, 'internal', terms)).toThrow(ModelPolicyError);
    expect(() => applyPolicy(chain, 'internal', terms)).toThrow(/data is "internal"/);
  });

  it('reads the data class from the call, else from the tool turn, else public', async () => {
    expect(dataClassFor(ctx({ 'governance.dataClass': 'internal' }))).toBe('internal');
    expect(dataClassFor(undefined)).toBe('public');
    const inTurn = await withTurnContext(ctx({ 'governance.dataClass': 'confidential' }), async () => {
      await new Promise((r) => setTimeout(r, 1));
      return dataClassFor(ctx(undefined));
    });
    expect(inTurn.result).toBe('confidential');
  });

  it('is applied per call by the agent model function', () => {
    const models = governedModels(chain, () => terms);
    expect(() => models({ requestContext: ctx({ 'governance.dataClass': 'internal' }) })).toThrow(ModelPolicyError);
    expect(models({ requestContext: ctx({ 'governance.dataClass': 'public' }) })).toHaveLength(2);
  });

  it('notes the models that answered inside a turn, across awaits', async () => {
    const { models } = await withTurnContext(undefined, async () => {
      noteModel('groq/openai/gpt-oss-120b');
      await Promise.resolve();
      noteModel('google/gemini');
      noteModel('groq/openai/gpt-oss-120b');
    });
    expect(models).toEqual(['groq/openai/gpt-oss-120b', 'google/gemini']);
  });

  it('accepts only known data classes from the API', () => {
    expect(parseDashboardSettings({ 'governance.dataClass': 'internal' }).dataClass).toBe('internal');
    expect(parseDashboardSettings({ 'governance.dataClass': 'secret' }).dataClass).toBeUndefined();
  });
});
