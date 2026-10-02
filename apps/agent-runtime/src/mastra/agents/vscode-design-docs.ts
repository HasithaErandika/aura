import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { designDocs as defaultClient, type DesignDocsClient } from '../lib/design-docs-client';
import { untrusted } from '../gateway/untrusted';

// The VS Code agent's read access to an Epic's design documents (architecture, SRS, delivery
// plan, ADRs, test plan and scenarios) in apps/api. Read-only: documents change in the web app
// (Architect, QA) or through a gate, never from a developer's session. Content is fenced as
// untrusted, because people edit these documents and the agent must not take them as orders.

const KINDS = ['architecture', 'srs', 'plan', 'adr', 'qa-plan', 'qa-scenario'] as const;
const LIMIT = 40_000;

export async function readDesignDocs(client: DesignDocsClient, input: { epicKey: string; slug?: string; kind?: (typeof KINDS)[number] }): Promise<string> {
  const epicKey = input.epicKey.trim().toUpperCase();
  const documents = await client.list(epicKey, input.kind ? [input.kind] : undefined);
  if (!input.slug) {
    if (!documents.length) return `No design documents for ${epicKey}${input.kind ? ` of kind ${input.kind}` : ''}.`;
    return [
      `Design documents for ${epicKey} (read one with its slug):`,
      ...documents.map((d) => `- ${d.slug} (${d.kind}, v${d.currentVersion}${d.issueKey ? `, ${d.issueKey}` : ''}): ${d.title}`),
    ].join('\n');
  }
  const doc = documents.find((d) => d.slug === input.slug);
  if (!doc) return `No document "${input.slug}" for ${epicKey}. Call design_docs without slug to list them.`;
  const { content, version } = await client.read(doc.id);
  const body = content.length > LIMIT ? `${content.slice(0, LIMIT)}\n…(truncated)` : content;
  return `${doc.title} (${doc.slug}, version ${version.version})\n\n${untrusted(`design document ${epicKey}/${doc.slug}`, body)}`;
}

export function designDocsTool(client: DesignDocsClient = defaultClient) {
  return createTool({
    id: 'design_docs',
    description:
      "Lists or reads the design documents of a Jira Epic: architecture plan, requirements (SRS), delivery plan, ADRs, test plan and test scenarios. Without slug it lists them; with slug it returns that document's Markdown. Read-only. Use it before implementing a Task to follow the approved design.",
    inputSchema: z.object({
      epicKey: z.string().min(3).describe('The Epic key, e.g. KAN-36'),
      slug: z.string().optional().describe('The document to read, from the list (e.g. architecture, adr/0001-use-nestjs)'),
      kind: z.enum(KINDS).optional().describe('Only list this kind'),
    }),
    outputSchema: z.string(),
    execute: async (input) => readDesignDocs(client, input),
  });
}
