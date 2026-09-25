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
import { devAgent } from './agents/dev-agent';
import { qaAgent } from './agents/qa-agent';
import { testerAgent } from './agents/tester-agent';
import { deployerAgent } from './agents/deployer-agent';
import { architectWorkflow } from './workflows/architect-workflow';
import { qaWorkflow } from './workflows/qa-workflow';
import { testerWorkflow } from './workflows/tester-workflow';
import { printManifest, type AgentId } from './agents/registry';
import { jiraMcp } from './mcp/jira-client';
import { getArchitectThreadRoute, listEpicsRoute, listWorkspaceFilesRoute, readWorkspaceFileRoute, writeWorkspaceFileRoute } from './server/workspace-routes';
import { findTaskWorktreeRoute, listDevWorkspaceFilesRoute, readDevWorkspaceFileRoute, writeDevWorkspaceFileRoute } from './server/dev-workspace-routes';
import { listDockerRunsRoute } from './server/docker-runs-routes';
import { listQaEpicsRoute, listQaWorkspaceFilesRoute, readQaWorkspaceFileRoute, writeQaWorkspaceFileRoute } from './server/qa-workspace-routes';
import { listTestRunsRoute } from './server/test-runs-routes';
import { addCouncilNoteRoute, councilRegistryRoute, councilUsageRoute } from './server/council-routes';
import { createImplementer, createPlanner, createReviewer } from './agents/council-agents';
import { startTerminalServer } from './terminal/server';
import { runnersRoute } from './server/runners-routes';

// Prints each agent's real tool wiring at startup, read live from the agent itself - there is no
// separate declared list to keep in sync (see agents/registry.ts).
const [orchestratorTools, poTools, baTools, architectTools, devTools, qaTools, testerTools, deployerTools, councilTools] = await Promise.all([
  orchestrator.listTools().then((tools) => Object.keys(tools)),
  poAgent.listTools().then((tools) => Object.keys(tools)),
  baAgent.listTools().then((tools) => Object.keys(tools)),
  architectAgent.listTools().then((tools) => Object.keys(tools)),
  devAgent.listTools().then((tools) => Object.keys(tools)),
  qaAgent.listTools().then((tools) => Object.keys(tools)),
  testerAgent.listTools().then((tools) => Object.keys(tools)),
  deployerAgent.listTools().then((tools) => Object.keys(tools)),
  // The Coding Council's agents are built per run (bound to one worktree); instances on a dummy
  // root are enough to read their real tool wiring - listing tools never touches the filesystem.
  Promise.all([createPlanner(process.cwd()), createImplementer(process.cwd()), createReviewer()].map((a) => a.listTools())).then((sets) => [...new Set(sets.flatMap((t) => Object.keys(t)))]),
]);
printManifest({
  orchestrator: orchestratorTools,
  'po-agent': poTools,
  'ba-agent': baTools,
  'architect-agent': architectTools,
  'dev-agent': devTools,
  'qa-agent': qaTools,
  'tester-agent': testerTools,
  'deployer-agent': deployerTools,
  // No backing Mastra Agent object to call listTools() on - see registry.ts's own note on this
  // entry. It holds no tools of its own either way (the council's and single agent's file tools aren't
  // Orchestrator-visible tools, the same way dev-agent's Docker command isn't).
  'coding-agent': [],
  'coding-council': councilTools,
  // Same reasoning as coding-agent - delegate_to_git and delegate_to_ci are entirely
  // deterministic, no model call.
  'git-tool': [],
  'ci-tool': [],
} satisfies Record<AgentId, readonly string[]>);

// The web terminal's WebSocket server (terminal/server.ts) - its own port, off unless
// TERMINAL_TICKET_SECRET is set.
startTerminalServer();

export const mastra = new Mastra({
  bundler: {
    externals: ['@duckdb/node-bindings'],
  },
  agents: { orchestrator, po: poAgent, ba: baAgent, architect: architectAgent, dev: devAgent, qa: qaAgent, tester: testerAgent, deployer: deployerAgent },
  // Registration key must match the id delegate-tools.ts requests via mastra.getWorkflow() -
  // Mastra resolves getWorkflow() by this key, not by the workflow's own internal `id` field.
  workflows: { 'architect-workflow': architectWorkflow, 'qa-workflow': qaWorkflow, 'tester-workflow': testerWorkflow },
  server: {
    apiRoutes: [
      listEpicsRoute,
      listWorkspaceFilesRoute,
      readWorkspaceFileRoute,
      writeWorkspaceFileRoute,
      getArchitectThreadRoute,
      listDevWorkspaceFilesRoute,
      readDevWorkspaceFileRoute,
      writeDevWorkspaceFileRoute,
      findTaskWorktreeRoute,
      listDockerRunsRoute,
      listQaEpicsRoute,
      listQaWorkspaceFilesRoute,
      readQaWorkspaceFileRoute,
      writeQaWorkspaceFileRoute,
      listTestRunsRoute,
      addCouncilNoteRoute,
      councilUsageRoute,
      councilRegistryRoute,
      runnersRoute,
    ],
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
