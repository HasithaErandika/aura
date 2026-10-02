import { describe, expect, it } from 'vitest';
import { keepKnownOperations, qaDocuments, qaDraftSchema, renderTestPlan } from './qa-drafts';

const draft = qaDraftSchema.parse({
  epicKey: 'KAN-36',
  summary: 'API and UI scenarios for tickets.',
  coverageMatrix: [{ storyKey: 'KAN-40', covered: true, note: 'list and create' }],
  scenarios: [
    { title: 'Create and list tickets', type: 'api', storyKeys: ['KAN-40'], steps: ['POST a ticket', 'GET the list'], fileName: 'create-and-list', operationIds: ['createTicket', 'listTickets', 'deleteEverything', 'listTickets'] },
    { title: 'Submit the form', type: 'ui', storyKeys: ['KAN-40'], steps: ['Fill the form'], fileName: 'submit-form' },
  ],
});

describe('QA scenarios against the API contract', () => {
  it('keeps only operationIds the contract defines, once each', () => {
    const kept = keepKnownOperations(draft, ['listTickets', 'createTicket']);
    expect(kept.scenarios[0]!.operationIds).toEqual(['createTicket', 'listTickets']);
    expect(kept.scenarios[1]!.operationIds).toEqual([]);
    expect(keepKnownOperations(draft, []).scenarios[0]!.operationIds).toEqual([]);
  });

  it('shows the operations in the test plan and the scenario document', () => {
    const kept = keepKnownOperations(draft, ['listTickets', 'createTicket']);
    expect(renderTestPlan(kept)).toContain('**Operations:** `createTicket`, `listTickets`');
    expect(qaDocuments(kept)[1]!.content).toContain('**Operations:** `createTicket`, `listTickets`');
    expect(qaDocuments(kept)[2]!.content).not.toContain('Operations');
  });
});
