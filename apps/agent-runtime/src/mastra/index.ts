import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { PostgresStore } from '@mastra/pg';
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
import { qaAgent } from './agents/qa-agent';
import { deployerAgent } from './agents/deployer-agent';
import { vscodeAgent } from './agents/vscode-agent';
import { coderAgents, evaluatorAgent } from './agents/coders';
import { architectWorkflow } from './workflows/architect-workflow';
import { qaWorkflow } from './workflows/qa-workflow';
import { printManifest, type AgentId } from './agents/registry';
import { metricsRoute } from './server/metrics-route';
import { tokenUsageRoute } from './server/usage-routes';
import { runtimeAuth, runtimeTokenFromEnv } from './server/runtime-auth';
import { assertServerModeSafe } from './config/aura-mode';

const toolIds = (agent: { listTools: () => Promise<Record<string, unknown>> | Record<string, unknown> }) => Promise.resolve(agent.listTools()).then((tools) => Object.keys(tools));

// Prints each agent's real tool wiring at startup, read live from the agents themselves.
printManifest({
  orchestrator: await toolIds(orchestrator),
  'po-agent': await toolIds(poAgent),
  'ba-agent': await toolIds(baAgent),
  'architect-agent': await toolIds(architectAgent),
  'qa-agent': await toolIds(qaAgent),
  'deployer-agent': await toolIds(deployerAgent),
  'vscode-agent': await toolIds(vscodeAgent),
  'task-planner': [],
  coder: [...new Set((await Promise.all(Object.values(coderAgents).map(toolIds))).flat())],
  evaluator: [],
  'git-agent': [],
} satisfies Record<AgentId, readonly string[]>);

// AURA_MODE=server refuses unsafe settings before anything starts listening.
assertServerModeSafe();

export const mastra = new Mastra({
  bundler: {
    externals: ['@duckdb/node-bindings'],
  },
  agents: { orchestrator, po: poAgent, ba: baAgent, architect: architectAgent, qa: qaAgent, deployer: deployerAgent, 'vscode-agent': vscodeAgent, ...coderAgents, evaluator: evaluatorAgent },
  // Keys must match the ids the delegate tools pass to mastra.getWorkflow().
  workflows: { 'architect-workflow': architectWorkflow, 'qa-workflow': qaWorkflow },
  server: {
    // Every request must carry apps/api's MASTRA_RUNTIME_TOKEN (server/runtime-auth.ts).
    middleware: runtimeAuth(runtimeTokenFromEnv()),
    apiRoutes: [metricsRoute, tokenUsageRoute],
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    // Memory, threads and suspended runs: Postgres (schema "mastra") with DATABASE_URL, else local libSQL.
    default: process.env.DATABASE_URL?.trim()
      ? new PostgresStore({ id: 'mastra-storage', connectionString: process.env.DATABASE_URL.trim(), schemaName: 'mastra' })
      : new LibSQLStore({
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
