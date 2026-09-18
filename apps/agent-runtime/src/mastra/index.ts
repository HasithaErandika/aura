import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from '@mastra/duckdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import {
  MastraStorageExporter,
  MastraPlatformExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { orchestrator } from './agents/orchestrator';
import { poAgent } from './agents/po-agent';
import { baAgent } from './agents/ba-agent';
import { architectAgent } from './agents/architect-agent';
import { architectWorkflow } from './workflows/architect-workflow';
import { printManifest, type AgentId } from './agents/registry';
import { jiraMcp } from './mcp/jira-client';
import { getArchitectThreadRoute, listEpicsRoute, listWorkspaceFilesRoute, readWorkspaceFileRoute, writeWorkspaceFileRoute } from './server/workspace-routes';

// Prints each agent's real tool wiring at startup, read live from the agent itself - there is no
// separate declared list to keep in sync (see agents/registry.ts).
const [orchestratorTools, poTools, baTools, architectTools] = await Promise.all([
  orchestrator.listTools().then((tools) => Object.keys(tools)),
  poAgent.listTools().then((tools) => Object.keys(tools)),
  baAgent.listTools().then((tools) => Object.keys(tools)),
  architectAgent.listTools().then((tools) => Object.keys(tools)),
]);
printManifest({
  orchestrator: orchestratorTools,
  'po-agent': poTools,
  'ba-agent': baTools,
  'architect-agent': architectTools,
} satisfies Record<AgentId, readonly string[]>);

export const mastra = new Mastra({
  bundler: {
    externals: ['@duckdb/node-bindings'],
  },
  agents: { orchestrator, po: poAgent, ba: baAgent, architect: architectAgent },
  // Registration key must match the id delegate-tools.ts requests via mastra.getWorkflow() -
  // Mastra resolves getWorkflow() by this key, not by the workflow's own internal `id` field.
  workflows: { 'architect-workflow': architectWorkflow },
  server: {
    apiRoutes: [listEpicsRoute, listWorkspaceFilesRoute, readWorkspaceFileRoute, writeWorkspaceFileRoute, getArchitectThreadRoute],
  },
  mcpServers: {
    ...(await jiraMcp.toMCPServerProxies()),
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: 'mastra-storage',
      url: process.env.TURSO_DATABASE_URL || 'file:./mastra.db',
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
