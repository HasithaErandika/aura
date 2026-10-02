import type { DesignDocLink, DesignDocWrite } from '../contracts/drafts';
import { auraApiHeaders, auraApiUrl } from './aura-api';

// Saves and reads design documents in apps/api (design_documents, migration 0010) over the
// internal routes (/internal/design-docs, runtime token), the same way bridge/client.ts sends
// bridge calls. Gate 3 and Gate 6 save here after the human approved; the VS Code agent reads.

export interface DesignDocSummary {
  id: string;
  epicKey: string;
  kind: DesignDocWrite['kind'];
  slug: string;
  title: string;
  issueKey: string | null;
  currentVersion: number;
  updatedAt: string;
}

export interface DesignDocContent {
  document: DesignDocSummary;
  version: { version: number; createdAt: string };
  content: string;
}

export function designDocsClient(fetchImpl: typeof fetch = fetch) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${auraApiUrl()}/internal/design-docs${path}`, {
        ...init,
        headers: auraApiHeaders(),
      });
    } catch (error) {
      throw new Error(`AURA API unreachable from the runtime (${error instanceof Error ? error.message : String(error)})`);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(`AURA API refused the design document request (${res.status})${body?.error?.message ? `: ${body.error.message}` : ''}`);
    }
    return (await res.json()) as T;
  }

  return {
    // Creates the document, or adds a version when its content changed. Returns its web link.
    async save(epicKey: string, doc: DesignDocWrite, meta: { agent: string; draftId?: string }): Promise<DesignDocLink & { id: string; version: number }> {
      const saved = await request<{ document: DesignDocSummary; url: string }>('', {
        method: 'POST',
        body: JSON.stringify({ epicKey, ...doc, agent: meta.agent, ...(meta.draftId ? { draftId: meta.draftId } : {}) }),
      });
      return { id: saved.document.id, version: saved.document.currentVersion, title: saved.document.title, url: saved.url };
    },
    async list(epicKey: string, kinds?: DesignDocWrite['kind'][]): Promise<DesignDocSummary[]> {
      const query = new URLSearchParams({ epicKey, ...(kinds?.length ? { kind: kinds.join(',') } : {}) });
      return (await request<{ documents: DesignDocSummary[] }>(`?${query}`)).documents;
    },
    async read(id: string, version?: number): Promise<DesignDocContent> {
      return request<DesignDocContent>(`/${encodeURIComponent(id)}${version ? `?version=${version}` : ''}`);
    },
  };
}

export type DesignDocsClient = ReturnType<typeof designDocsClient>;
export const designDocs: DesignDocsClient = designDocsClient();
