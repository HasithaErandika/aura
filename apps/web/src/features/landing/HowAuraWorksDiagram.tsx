import { useState, useEffect } from "react";
import {
  AgentIcon,
  AuditIcon,
  CheckIcon,
  CodeIcon,
  DocumentIcon,
  GateIcon,
  LayersIcon,
  PersonIcon,
  RunIcon,
  SearchIcon,
  SwapIcon,
  TicketIcon,
} from "../../shared/icons/index.tsx";

interface LifecycleStage {
  id: string;
  step: number;
  role: string;
  agent: string;
  icon: typeof PersonIcon;
  objective: string;
  outputs: string[];
  gate: string;
  gateRole: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  jiraTransition: string;
  codeSnippet: string;
}

const STAGES: LifecycleStage[] = [
  {
    id: "po",
    step: 1,
    role: "Project Owner",
    agent: "PO Agent",
    icon: PersonIcon,
    objective: "Drafts Epic with strategic objectives, scope boundaries, and key stakeholders.",
    outputs: ["Epic document", "Stakeholder map", "Success metrics"],
    gate: "Gate 1: Human PO approves Epic definition & scope",
    gateRole: "Project Owner",
    riskTier: "MEDIUM",
    jiraTransition: "Draft → Ready for Analysis",
    codeSnippet: `// Policy Engine Check
policy.evaluate({
  user: "po-lead@aura.internal",
  agent: "po-agent@v2.1",
  action: "jira.createEpic",
  riskTier: "MEDIUM"
}) // -> REQUIRES_APPROVAL (Gate 1)`,
  },
  {
    id: "ba",
    step: 2,
    role: "Business Analyst",
    agent: "BA Agent",
    icon: DocumentIcon,
    objective: "Generates As-Is/To-Be workflows, User Stories, Acceptance Criteria (AC), and DoD.",
    outputs: ["User Stories", "Gherkin AC", "Definition of Done"],
    gate: "Gate 2: Human BA verifies & signs off on Stories and AC",
    gateRole: "Business Analyst",
    riskTier: "MEDIUM",
    jiraTransition: "Ready for Analysis → Ready for Architecture",
    codeSnippet: `// Schema Validation & Payload Hash
const payload = storySchema.parse(agentOutput);
const contentHash = sha256(JSON.stringify(payload));
createApprovalRequest({ gate: "GATE_2_BA", contentHash });`,
  },
  {
    id: "architect",
    step: 3,
    role: "Architect",
    agent: "Architect Agent",
    icon: SwapIcon,
    objective: "Decomposes requirements into API schemas, data models, NFRs, and ADR records.",
    outputs: ["ADR Document", "OpenAPI spec", "Subtask breakdown"],
    gate: "Gate 3: Human Architect approves technical design & ADRs",
    gateRole: "Architect",
    riskTier: "MEDIUM",
    jiraTransition: "Ready for Architecture → Ready for Development",
    codeSnippet: `// Architectural Decision Record (ADR)
adrService.propose({
  title: "ADR-042: Event Bus Serialization",
  status: "PROPOSED",
  approvedBy: null // Awaiting Human Architect
});`,
  },
  {
    id: "dev",
    step: 4,
    role: "Developer",
    agent: "Dev Agents (FE/BE)",
    icon: CodeIcon,
    objective: "Implements feature code in an isolated container sandbox and submits a Pull Request.",
    outputs: ["Git feature branch", "Pull Request", "Unit test suite"],
    gate: "Gate 4: Human Developer performs code review & merges PR",
    gateRole: "Developer",
    riskTier: "MEDIUM",
    jiraTransition: "Ready for Development → In QA",
    codeSnippet: `// Sandbox Tool Execution
sandbox.exec({
  cmd: "git push origin feature/AURA-42",
  token: singleUseApprovalToken,
  isolationLevel: "CONTAINER_STRICT"
});`,
  },
  {
    id: "qa",
    step: 5,
    role: "QA Engineer",
    agent: "QA Agent",
    icon: AuditIcon,
    objective: "Synthesizes test plans and automatically drafts Playwright & Robot Framework suites.",
    outputs: ["Test Plan", "Playwright E2E spec", "Robot test scripts"],
    gate: "Gate 5: Human QA approves test plan & execution scope",
    gateRole: "QA Engineer",
    riskTier: "LOW",
    jiraTransition: "In QA → Testing In Progress",
    codeSnippet: `// Test Plan Approval Gate
const testPlan = qaAgent.generatePlan(stories);
approvalService.request({
  gate: "GATE_5_QA_PLAN",
  payload: testPlan
});`,
  },
  {
    id: "tester",
    step: 6,
    role: "QA Engineer",
    agent: "Tester Agent",
    icon: SearchIcon,
    objective: "A bounded loop, not a separate role: runs the suite, diagnoses each failure from real evidence, and routes it back to Dev or QA automatically.",
    outputs: ["Machine test evidence", "Diagnosis + confidence per failure", "Linked defect, updated per attempt"],
    gate: "QA Engineer starts it; escalates back to a human after 3 attempts or an unclear diagnosis",
    gateRole: "QA Engineer",
    riskTier: "LOW",
    jiraTransition: "Testing In Progress → Ready for Release (or HALTED_LOOP_GUARD)",
    codeSnippet: `// Evidence-based diagnosis, bounded retry
const diagnosis = diagnose(failure, evidence);
route(diagnosis); // code_bug -> Dev, bad_test -> QA, unknown -> human
if (attempt >= maxIterations) status = "HALTED_LOOP_GUARD";`,
  },
  {
    id: "deployer",
    step: 7,
    role: "Deployer",
    agent: "Deployer Agent",
    icon: GateIcon,
    objective: "Prepares release notes, change plan, and automated rollback triggers for production deployment.",
    outputs: ["Release package", "Rollback policy", "Deployment log"],
    gate: "Gate 7: Human Deployer + 4-Eyes Secondary Sign-off + Change Window Check",
    gateRole: "Deployer + Peer",
    riskTier: "HIGH",
    jiraTransition: "Ready for Release → Done (Released)",
    codeSnippet: `// Four-Eyes & Production Gate (HIGH Risk)
policy.evaluateDeploy({
  environment: "PRODUCTION",
  primaryApprover: "deployer-lead@aura.internal",
  secondaryApprover: "sec-admin@aura.internal", // Four-Eyes requirement
  changeWindowOpen: true
});`,
  },
];

const ARCH_LAYERS = [
  {
    title: "1. Users & Roles (Enterprise SSO)",
    desc: "Project Owners, BAs, Architects, Developers, QA Engineers, Deployers",
    tag: "Supabase Auth / SAML SSO",
    color: "border-brand/40 bg-brand-soft/40 text-brand-navy",
  },
  {
    title: "2. apps/web (React + Vite)",
    desc: "Agent Workspace, Approval Inbox, Run Console, Agent Registry, Audit Explorer",
    tag: "UI Presentation Layer",
    color: "border-brand-orange/40 bg-brand-orange-soft/40 text-brand-navy",
  },
  {
    title: "3. apps/api (Node + Express Policy Engine)",
    desc: "AuthN/AuthZ, Deterministic Policy, Approval Service, Jira Webhooks, Audit Writer",
    tag: "Deterministic Gate Control",
    color: "border-brand-navy-light bg-brand-navy-light/10 text-brand-navy",
  },
  {
    title: "4. Postgres Event Bus (Queue)",
    desc: "jira.issue.transitioned · approval.decided · run.requested · test.completed",
    tag: "Durable Workflow Messages",
    color: "border-brand/40 bg-brand-soft/40 text-brand-navy",
  },
  {
    title: "5. apps/agent-runtime (Mastra TS)",
    desc: "Orchestrator Workflow, Scoped RAG (pgvector), Tool Gateway, Zod Schema Enforcement",
    tag: "Mastra Agent Runtime",
    color: "border-brand-orange/40 bg-brand-orange-soft/40 text-brand-navy",
  },
  {
    title: "6. External Integrations",
    desc: "Jira Cloud/DC · GitHub/GitLab · CI/CD Pipelines · Playwright · LLM Region Router",
    tag: "System of Record & Execution",
    color: "border-brand-navy bg-brand-navy text-on-dark",
  },
];

export function HowAuraWorksDiagram() {
  const [activeTab, setActiveTab] = useState<"LIFECYCLE" | "ARCHITECTURE" | "AUTHORIZATION">("LIFECYCLE");
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playSpeed = 2000;

  const currentStage = STAGES[activeStepIndex];

  // Auto simulation timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isPlaying) {
      timer = setInterval(() => {
        setActiveStepIndex((prev) => (prev + 1) % STAGES.length);
      }, playSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, playSpeed]);

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-xl sm:p-8">
      {/* Top Header & View Controls */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
            <LayersIcon className="size-4" />
            Live Architecture & Workflow Visualizer
          </div>
          <h3 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">
            How AURA Operates: Propose with AI, Decide with Humans
          </h3>
          <p className="mt-1 text-sm text-ink-600">
            Select a view to explore AURA’s end-to-end governance, 7-gate lifecycle, and authorization boundary.
          </p>
        </div>

        {/* View Mode Tabs */}
        <div className="flex rounded-lg bg-canvas p-1 border border-line">
          <button
            onClick={() => setActiveTab("LIFECYCLE")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "LIFECYCLE"
                ? "bg-brand text-on-dark shadow-sm"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            7-Gate Lifecycle
          </button>
          <button
            onClick={() => setActiveTab("ARCHITECTURE")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "ARCHITECTURE"
                ? "bg-brand text-on-dark shadow-sm"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Layered System
          </button>
          <button
            onClick={() => setActiveTab("AUTHORIZATION")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "AUTHORIZATION"
                ? "bg-brand text-on-dark shadow-sm"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Gate Authorization
          </button>
        </div>
      </div>

      {/* VIEW 1: 7-GATE LIFECYCLE FLOW */}
      {activeTab === "LIFECYCLE" && (
        <div className="mt-6 space-y-8">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-canvas p-4 border border-line">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                  isPlaying ? "bg-brand-orange text-on-dark" : "bg-brand text-on-dark hover:bg-brand-hover"
                }`}
              >
                <RunIcon className="size-4" />
                {isPlaying ? "Pause Simulation" : "Simulate Live Run"}
              </button>
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setActiveStepIndex(0);
                }}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-700 hover:bg-canvas"
              >
                Reset
              </button>
            </div>

            {/* Stepper Navigation */}
            <div className="flex items-center gap-2 text-xs font-medium text-ink-600">
              <span>Stage {activeStepIndex + 1} of {STAGES.length}:</span>
              <span className="font-semibold text-brand-navy">{currentStage.agent}</span>
              <div className="ml-2 flex items-center gap-1">
                <button
                  disabled={activeStepIndex === 0}
                  onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
                  className="rounded border border-line px-2 py-1 text-ink-600 hover:bg-canvas disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  disabled={activeStepIndex === STAGES.length - 1}
                  onClick={() => setActiveStepIndex((prev) => Math.min(STAGES.length - 1, prev + 1))}
                  className="rounded border border-line px-2 py-1 text-ink-600 hover:bg-canvas disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* Pipeline Stepper Nodes */}
          <div className="relative">
            {/* Connecting line */}
            <div aria-hidden className="absolute left-0 top-6 hidden h-1 w-full bg-line lg:block" />
            <div
              aria-hidden
              className="absolute left-0 top-6 hidden h-1 bg-gradient-to-r from-brand to-brand-orange transition-all duration-500 lg:block"
              style={{ width: `${(activeStepIndex / (STAGES.length - 1)) * 100}%` }}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
              {STAGES.map((stage, idx) => {
                const isActive = idx === activeStepIndex;
                const isPassed = idx < activeStepIndex;
                const Icon = stage.icon;

                return (
                  <button
                    key={stage.id}
                    onClick={() => {
                      setIsPlaying(false);
                      setActiveStepIndex(idx);
                    }}
                    className={`relative flex flex-col items-center rounded-xl p-4 text-center transition-all ${
                      isActive
                        ? "border-2 border-brand bg-brand-soft/30 shadow-lg ring-4 ring-brand/10 scale-105 z-10"
                        : isPassed
                        ? "border border-line bg-surface hover:border-brand/40"
                        : "border border-line/60 bg-canvas opacity-70 hover:opacity-100"
                    }`}
                  >
                    {/* Node Badge Icon */}
                    <div
                      className={`relative z-10 flex size-11 items-center justify-center rounded-full transition-all ${
                        isActive
                          ? "bg-brand text-on-dark shadow-md animate-pulse-glow"
                          : isPassed
                          ? "bg-brand-orange text-on-dark"
                          : "bg-surface border-2 border-line text-ink-500"
                      }`}
                    >
                      <Icon className="size-5" />
                    </div>

                    <span className="mt-3 text-xs font-bold text-ink-900">
                      Step {stage.step}
                    </span>
                    <span className="mt-0.5 text-xs font-semibold text-brand-navy">
                      {stage.agent}
                    </span>
                    <span className="mt-1 inline-flex items-center rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-ink-600 border border-line">
                      Gate {stage.step}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Node Detailed Inspection Drawer */}
          <div className="rounded-xl border border-line bg-canvas p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-brand text-on-dark">
                  <AgentIcon className="size-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase text-brand">
                    Active Agent Stage Details
                  </span>
                  <h4 className="text-xl font-bold text-ink-900">
                    Step {currentStage.step}: {currentStage.agent} ({currentStage.role})
                  </h4>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    currentStage.riskTier === "HIGH"
                      ? "bg-danger-soft text-danger border border-danger/30"
                      : currentStage.riskTier === "MEDIUM"
                      ? "bg-warning-soft text-warning border border-warning/30"
                      : "bg-success-soft text-success border border-success/30"
                  }`}
                >
                  {currentStage.riskTier} RISK TIER
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink-700 border border-line">
                  <TicketIcon className="size-3.5 text-brand" />
                  {currentStage.jiraTransition}
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <h5 className="text-xs font-bold uppercase text-ink-500">Agent Purpose</h5>
                  <p className="mt-1 text-sm leading-relaxed text-ink-800 font-medium">
                    {currentStage.objective}
                  </p>
                </div>

                <div>
                  <h5 className="text-xs font-bold uppercase text-ink-500">Generated Artifacts</h5>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {currentStage.outputs.map((out) => (
                      <span
                        key={out}
                        className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-ink-700 border border-line"
                      >
                        <CheckIcon className="size-3 text-brand" />
                        {out}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-brand/30 bg-brand-soft/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-brand">
                    <GateIcon className="size-4" />
                    Human Approval Gate
                  </div>
                  <p className="mt-1 text-xs font-semibold text-brand-navy">
                    {currentStage.gate}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-600">
                    Required Approver Role: <strong className="text-ink-900">{currentStage.gateRole}</strong>. Action is suspended in AURA until approved.
                  </p>
                </div>
              </div>

              {/* Code / Policy Inspection Box */}
              <div className="rounded-lg bg-brand-navy p-4 text-on-dark font-mono text-xs">
                <div className="flex items-center justify-between border-b border-brand-navy-light pb-2 text-[11px] text-ink-400">
                  <span>Policy & Execution Interceptor Log</span>
                  <span className="text-brand-orange">AURA-POLICY-ENGINE</span>
                </div>
                <pre className="mt-3 overflow-x-auto text-ink-200 leading-relaxed scroll-quiet">
                  <code>{currentStage.codeSnippet}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: LAYERED ARCHITECTURE VIEW */}
      {activeTab === "ARCHITECTURE" && (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-ink-600">
            AURA architecture isolates deterministic decisions, policy validation, and audit from the LLM runtime.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ARCH_LAYERS.map((layer) => (
              <div
                key={layer.title}
                className={`rounded-xl border p-5 shadow-sm transition-all hover:shadow-md ${layer.color}`}
              >
                <span className="inline-block rounded-md bg-surface/80 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase border border-line">
                  {layer.tag}
                </span>
                <h4 className="mt-3 text-base font-bold">{layer.title}</h4>
                <p className="mt-1 text-xs leading-relaxed opacity-90">{layer.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 3: AUTHORIZATION & GATE INTERCEPTOR */}
      {activeTab === "AUTHORIZATION" && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-line bg-canvas p-6">
            <h4 className="text-base font-bold text-ink-900">
              Deterministic Gate Authorization Sequence (Section 4.3)
            </h4>
            <p className="mt-1 text-xs text-ink-600">
              Every tool call by an agent passes through Zod schema validation, RBAC policy checks, payload hash snapshots, and single-use approval tokens.
            </p>

            <ol className="relative mt-6 space-y-4 border-l-2 border-brand/30 pl-6">
              <li className="relative">
                <span className="absolute -left-[31px] top-0 flex size-6 items-center justify-center rounded-full bg-brand text-on-dark text-xs font-bold">
                  1
                </span>
                <h5 className="text-xs font-bold text-ink-900">User Initiates Run via SSO</h5>
                <p className="text-xs text-ink-600">JWT claims load org, project scope, and verified roles.</p>
              </li>
              <li className="relative">
                <span className="absolute -left-[31px] top-0 flex size-6 items-center justify-center rounded-full bg-brand text-on-dark text-xs font-bold">
                  2
                </span>
                <h5 className="text-xs font-bold text-ink-900">Policy Engine Evaluation</h5>
                <p className="text-xs text-ink-600">
                  <code className="text-brand">can(user, project, agent@version, action)</code> grants scoped tool set & risk ceiling.
                </p>
              </li>
              <li className="relative">
                <span className="absolute -left-[31px] top-0 flex size-6 items-center justify-center rounded-full bg-brand-orange text-on-dark text-xs font-bold">
                  3
                </span>
                <h5 className="text-xs font-bold text-ink-900">Medium/High Risk Tool Call Pauses Workflow</h5>
                <p className="text-xs text-ink-600">
                  Runtime status transitions to <code className="text-brand">SUSPENDED_FOR_APPROVAL</code> and locks proposed output snapshot.
                </p>
              </li>
              <li className="relative">
                <span className="absolute -left-[31px] top-0 flex size-6 items-center justify-center rounded-full bg-success text-on-dark text-xs font-bold">
                  4
                </span>
                <h5 className="text-xs font-bold text-ink-900">Human Approval & Single-Use Token Execution</h5>
                <p className="text-xs text-ink-600">
                  Approver signs decision. API verifies hash hasn’t mutated, issues a single-use token, and updates Jira.
                </p>
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
