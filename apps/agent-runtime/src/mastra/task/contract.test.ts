import { describe, expect, it, vi } from 'vitest';
import { architectureDocuments, architectureDraftSchema, renderArchitecture } from '../contracts/drafts';
import type { DesignDocsClient } from '../lib/design-docs-client';
import { checkOpenApi } from '../lib/openapi';
import { CONTRACT_PATH, writeContract } from './contract';

const OPENAPI = `openapi: 3.1.0
info: { title: Tickets, version: 1.0.0 }
paths:
  /tickets:
    get: { operationId: listTickets, responses: { "200": { description: ok } } }
    post: { operationId: createTicket, responses: { "201": { description: created } } }
`;

const draft = architectureDraftSchema.parse({
  epicKey: 'KAN-36',
  relatedEpicKeys: ['KAN-36'],
  techStack: { frontend: 'React', backend: 'NestJS', database: 'PostgreSQL' },
  requirementsSummary: 'Customers submit tickets.',
  decomposition: 'A web app and an API.',
  apiDesign: 'REST endpoints under /tickets.',
  dataDesign: 'A tickets table.',
  securityDesign: 'JWT sessions.',
  aiDesign: '',
  deploymentAndTestingNotes: 'Contract tests in CI.',
  adrs: [{ title: 'Use REST over HTTP', context: 'Simple clients call the API.', decision: 'Expose a REST API under /tickets.', consequences: ['Easy to test'] }],
  tasks: [{ title: 'Build the tickets API', discipline: 'Backend', description: 'CRUD endpoints for tickets.', acceptanceCriteria: ['Creates a ticket'], priority: 'High', estimate: 'M', relatedStories: ['KAN-40'] }],
});

describe('the Epic API contract (OpenAPI 3.1)', () => {
  it('is saved as its own design document only when the Epic has one', () => {
    expect(architectureDocuments(draft).some((d) => d.kind === 'openapi')).toBe(false);
    expect(architectureDocuments({ ...draft, openapi: OPENAPI }).find((d) => d.kind === 'openapi')).toMatchObject({ slug: 'openapi', content: OPENAPI });
  });

  it('shows its operations for the Gate 3 review', () => {
    const md = renderArchitecture({ ...draft, openapi: OPENAPI });
    expect(md).toContain('## API contract (OpenAPI 3.1)');
    expect(md).toContain('- `GET /tickets` listTickets');
    expect(md).toContain('- `POST /tickets` createTicket');
    expect(renderArchitecture(draft)).not.toContain('API contract');
  });

  it('is checked by code the same way the API checks it', () => {
    expect(checkOpenApi(OPENAPI).problems).toEqual([]);
    expect(checkOpenApi(OPENAPI.replace('3.1.0', '3.0.0')).problems).toEqual(['openapi must be "3.1.x"']);
  });

  it('is written to contracts/openapi.yaml at Gate 6 when the Epic has one', async () => {
    const client = { list: vi.fn(async () => [{ id: 'doc-1' }]), read: vi.fn(async () => ({ content: OPENAPI })) } as unknown as DesignDocsClient;
    const bridge = { call: vi.fn(async () => ({})) };
    expect(await writeContract(bridge, 'KAN-36', client)).toBe(true);
    expect(bridge.call).toHaveBeenCalledWith('fs.writeFile', { path: CONTRACT_PATH, content: OPENAPI, overwrite: true });
    const none = { list: vi.fn(async () => []), read: vi.fn() } as unknown as DesignDocsClient;
    expect(await writeContract(bridge, 'KAN-36', none)).toBe(false);
    expect(await writeContract(bridge, null, client)).toBe(false);
  });
});
