import { AsyncLocalStorage } from 'node:async_hooks';

// The turn a piece of work belongs to. Delegate tools call agents and workflows without passing
// the request context along, so the gateway runs each tool inside this store: the model policy
// reads the turn's settings from it, and every model that answers is noted for the audit trail.

interface RequestContextLike {
  get: (key: string) => unknown;
}

interface TurnStore {
  requestContext: RequestContextLike | undefined;
  models: Set<string>;
}

const storage = new AsyncLocalStorage<TurnStore>();

export async function withTurnContext<T>(requestContext: RequestContextLike | undefined, fn: () => Promise<T>): Promise<{ result: T; models: string[] }> {
  const store: TurnStore = { requestContext, models: new Set() };
  const result = await storage.run(store, fn);
  return { result, models: [...store.models] };
}

export function turnRequestContext(): RequestContextLike | undefined {
  return storage.getStore()?.requestContext;
}

export function noteModel(model: string): void {
  if (model) storage.getStore()?.models.add(model);
}
