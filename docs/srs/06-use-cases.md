# SRS — 06. Use Cases

Each use case corresponds to one gate in the lifecycle in [../ARCHITECTURE.md §5.1](../ARCHITECTURE.md#51-lifecycle-with-gates).

## UC-1 — Approve Epic (Gate 1)

- **Actor:** Project Owner
- **Preconditions:** PO Agent has drafted an Epic (objective, scope, stakeholders, priority) from a free-text business requirement.
- **Flow:** PO reviews the draft in the Approval Inbox → approves or rejects with comments.
- **Postcondition (approve):** Jira Epic created, status `Ready for Analysis`.
- **Postcondition (reject):** PO Agent re-drafts using the PO's feedback.

## UC-2 — Approve Stories (Gate 2)

- **Actor:** Business Analyst
- **Preconditions:** BA Agent has produced Stories, AC, DoD, NFRs, risks, and a process map from the approved Epic.
- **Flow:** BA reviews and approves/rejects.
- **Postcondition (approve):** Jira Stories created, status `Ready for Architecture`.

## UC-3 — Approve Architecture (Gate 3)

- **Actor:** Architect
- **Preconditions:** Architect Agent has produced decomposition, API/data/security/AI/integration/deployment design, and ADRs from approved Stories.
- **Flow:** Architect reviews ADRs and architecture tasks; approves or rejects.
- **Postcondition (approve):** Jira architecture tasks created, status `Ready for Development`.

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
