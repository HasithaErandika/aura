import { z } from 'zod';

// Provides shared structured-output validation for delegate tools and workflow steps.
// If the agent returns invalid JSON, it retries once to handle occasional small-model formatting errors.

export interface AgentLike {
  generate: (prompt: string, options: Record<string, unknown>) => Promise<{ object?: unknown; text?: string }>;
}
export type MastraLike = { getAgent: (id: string) => AgentLike } | undefined;

function tryParseJson(text: string | undefined): unknown {
  if (!text) return undefined;
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]);
  } catch {
    return undefined;
  }
}

export async function generateObject<T>(mastra: MastraLike, agentId: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
  const agent = mastra?.getAgent(agentId);
  if (!agent) throw new Error(`agent "${agentId}" is not registered`);
  return generateObjectWith(agent, agentId, prompt, schema);
}

// Same as generateObject, for an agent that is not registered with Mastra (built per call and
// bound to one Task's directory - e.g. the Coding Council's Reviewer, agents/council-agents.ts).
export async function generateObjectWith<T>(agent: AgentLike, label: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
  const attempt = async () => {
    const result = await agent.generate(prompt, {
      structuredOutput: { schema, jsonPromptInjection: true, errorStrategy: 'strict' },
      maxSteps: 1,
    });
    const parsed = schema.safeParse(result.object ?? tryParseJson(result.text));
    if (!parsed.success) throw new Error(`${label} returned an invalid draft: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
    return parsed.data;
  };
  try {
    return await attempt();
  } catch (first) {
    try {
      return await attempt();
    } catch {
      throw first;
    }
  }
}
