# SRS — 06. Use Cases

Each use case corresponds to one gate in the lifecycle in [../ARCHITECTURE.md §5.1](../ARCHITECTURE.md#51-lifecycle-with-gates).

## UC-1 — Approve Epic (Gate 1)

- **Actor:** Project Owner
- **Preconditions:** The PO has briefed the Orchestrator in the Agent Workspace; the Orchestrator delegated to the PO Agent, which returned a structured Epic draft (objective, scope, stakeholders, priority, success metrics, assumptions).
- **Flow:** The Orchestrator shows the draft and pauses. The PO decides in the workspace gate card or the Approval Inbox: approve, revise with feedback, or reject with a reason. The decision is recorded against the snapshot hash and the run resumes.
- **Postcondition (approve):** the delegate tool files the Epic in Jira from the stored draft with a provenance stamp; the Orchestrator asks whether to continue to Stories.
- **Postcondition (revise):** the PO Agent produces a new draft version from the feedback; the PO reviews again.
- **Postcondition (reject):** the run ends; nothing is filed.

## UC-2 — Approve Stories (Gate 2)

- **Actor:** Business Analyst
- **Preconditions:** An approved Epic exists in Jira. Either the same run continued from UC-1 or a BA briefed the Orchestrator with the Epic key. The BA Agent returned structured Stories (description, acceptance criteria, definition of done, priority, risks) plus epic-wide NFRs.
- **Flow:** The Orchestrator shows the Stories and pauses. A Business Analyst decides in the workspace or the Approval Inbox: approve, revise with feedback, or reject with a reason. If the run was started by a Project Owner, their workspace waits and continues automatically once the BA decides.
- **Postcondition (approve):** the delegate tool files one Jira Story per approved story under the Epic, idempotently, and comments on the Epic with the keys.
- **Postcondition (revise or reject):** as in UC-1.

## UC-3 — Approve Architecture (Gate 3)

- **Actor:** Architect
- **Preconditions:** An approved Epic with approved Stories exists in Jira. The Architect Workflow (a Mastra Workflow, not one model call — requirements analysis, decomposition, then API/data/security/AI design in parallel, then deployment/testing notes, then ADRs and tasks) has produced a design and effort-estimated tasks.
- **Flow:** The Orchestrator shows the design and pauses; progress from each workflow step streams live while it runs. The Architect approves, requests a revision with feedback, or rejects.
- **Postcondition (approve):** Jira architecture tasks are created (status `Ready for Development`); ADRs, a requirements summary, `architecture.md`, and `plan.md` are written to the Architect's per-Epic workspace, viewable read-only in the web app; a comment on the Epic points to those files.
- **Postcondition (revise or reject):** as in UC-1.

## UC-4 — Review & Merge PR (Gate 4)

- **Actor:** Developer (scoped to FE/BE/Data/AI/Integration)
- **Preconditions:** A Dev sub-agent has produced code in a sandbox, opened a branch and PR linked to the architecture task.
- **Flow:** Developer reviews the PR on the Git host; requests changes (loops back to the Dev agent) or merges.
- **Postcondition (merge):** Jira task transitions to `In QA`.

## UC-5 — Approve Test Plan (Gate 5)

- **Actor:** QA Engineer
- **Preconditions:** QA Agent has produced a test plan, coverage matrix, and Playwright/Robot Framework suites from Stories + AC + DoD.
- **Flow:** QA reviews and approves/rejects the plan.
- **Postcondition (approve):** CI executes the suites, producing machine-generated results and traces.

## UC-6 — Verify Test Results (Gate 6)

- **Actor:** QA Engineer
- **Preconditions:** Tester Agent has interpreted CI results, filed defect tickets, and flagged flakiness.
- **Flow:** QA reviews the AI interpretation against the linked raw evidence; verifies pass or routes defects back to Dev.
- **Postcondition (pass):** Jira story transitions to `Ready for Release`.
- **Postcondition (defects):** Loops back to UC-4 (Dev agents), bounded by the loop guard (`max_iterations`, default 3).

## UC-7 — Approve Release (Gate 7)

- **Actor:** Deployer + a second approver (four-eyes)
- **Preconditions:** Deployer Agent has produced release notes, a change plan, and a rollback plan for the approved release candidate.
- **Flow:** Deployer and a second approver (who did not request the deploy) review the change plan and change window; approve or reject.
- **Postcondition (approve):** Production deploy via CI/CD with an automatic rollback trigger; Jira issue moves to `Done` with the release linked.

## UC-8 — Manage Agent Registry (cross-cutting)

- **Actor:** Admin
- **Flow:** Admin views/edits role → agent → tool grants and agent version status (`DRAFT`/`CANARY`/`ACTIVE`/`DEPRECATED`) in the Registry UI.
- **Constraint:** Admin actions are fully audited; Admins cannot approve gated actions on behalf of another role or bypass a gate.

## UC-9 — Audit a Run (cross-cutting)

- **Actor:** Admin / Compliance
- **Flow:** Use the Audit Explorer to trace a run end-to-end via its `trace_id`: agent version, prompt version, model, every tool call, every approval decision, and every artifact touched.
