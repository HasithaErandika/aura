# QA/Tester evidence run against KAN-36 (2026-09-22)

Real run against the live system - not a simulation. Driven by talking directly to the running
`apps/agent-runtime` Orchestrator over its actual chat/stream API (`POST /api/agents/orchestrator/stream`
and `/resume-stream` on `http://localhost:4111`, the same wire protocol `apps/api`'s
`run-stream.service.ts` uses), acting as the human QA approver at each gate, with real Groq/Gemini
model calls, real Jira reads, and (where reached) real Docker execution. Full raw SSE transcript
(every chunk, unmodified) is in `docs/logs/qa-tester-run-KAN-36.raw.log` in the same directory -
this file is the curated summary; that one is the unedited evidence.

Target: KAN-36 ("Customer Self-Service Password Reset"), the only Epic with approved Stories and a
filed architecture but no QA workspace yet - i.e. Gate 6 had never run for it.

## What actually happened, in order

**1. First attempt (03:45:36 UTC) failed immediately - the Orchestrator itself never got to call a tool.**

Sent "Draft a test plan for Epic KAN-36." to a fresh thread. The very first model call errored:

```
AI_APICallError: You exceeded your current quota, please check your plan and billing details...
* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests,
  limit: 20, model: gemini-3.5-flash
```

This is `models.ts`'s Groq-primary/Gemini-fallback list (`withGeminiFallback`) landing on its
*fallback* entry and failing there too - meaning the primary (Groq) attempt had already failed
silently before this. The turn ended in `FAILED` with no tool ever called.

**2. Root-caused it instead of retrying blind.** Confirmed both providers directly, outside AURA:

- Groq's own API works fine standalone: a plain `qwen/qwen3.8-27b` chat completion (no tools)
  returned `pong` correctly, HTTP 200.
- But the *Orchestrator's own model*, `groq/qwen/qwen3.8-27b` (`agents/registry.ts`), reliably
  fails Groq's tool-calling for this exact kind of prompt: 3/3 direct calls with a tool schema
  attached returned Groq's own `400 tool_use_failed` - the model emits a literal
  `<tool_call><function=ask_user>...` text block instead of a structured call, which is not a
  Mastra/AURA bug, it's this model's own tool-calling reliability on Groq's API.
- `groq/openai/gpt-oss-120b` (already used by BA/Architect/QA/Deployer) was tested the same way,
  with the same tool schema, and completed normally with no error.
- Separately, Gemini's fallback (`gemini-3.5-flash`) is at its **free-tier limit of 20
  requests/day per project/model** - already exhausted account-wide before this run even started
  (from earlier fallback attempts today and on 2026-09-21), so every time Groq fails, the safety
  net is also out of runway until the daily quota resets.

**3. Fix applied:** `apps/agent-runtime/src/mastra/agents/registry.ts` - `ORCHESTRATOR_MODEL_ID`
changed from `groq/qwen/qwen3.8-27b` to `groq/openai/gpt-oss-120b`, with the evidence above
recorded as a code comment. `mastra dev`'s file watcher picked it up live; no restart needed. This
is the only model changed - PO/Dev/Tester still use `qwen3.8-27b` and were not touched, since they
were not the ones observed failing here.

**4. Retried "Draft a test plan for Epic KAN-36." (03:49:02 UTC) - this time it worked, for real:**

- Orchestrator correctly called `delegate_to_qa` (`mode: draft`, `epicKey: KAN-36`) - Groq,
  `gpt-oss-120b`, no error.
- The real `qa-workflow` ran inside that tool call, with live step progress observed:
  `coverage-and-scenarios` (start 03:49:06 -> result 03:49:32, ~26s) then `write-tests` (start
  03:49:32 -> result 03:51:16, ~1m44s).
- **Real QA Agent output** - a genuine test plan against KAN-36's actual filed Stories (read live
  from Jira: KAN-37 through KAN-41), 5 scenarios, mixing UI and API coverage:
  1. `forgot-password-ui-flow.spec.ts` (UI) - KAN-37, the Forgot Password link/email flow.
  2. `reset-token-generation-api.spec.ts` (API) - KAN-38, token generation/entropy/persistence.
  3. `password-reset-email-api.spec.ts` (API) - KAN-39, email dispatch, retries, template.
  4. `reset-landing-page-ui.spec.ts` (UI) - KAN-40, token validation + password-strength UI.
  5. `token-invalidation-audit-api.spec.ts` (API) - KAN-41, token reuse rejection + audit trail.
  Every Story got a coverage row; nothing was marked "not covered." Full markdown is in the raw
  log (search `QA-be579c64`).
- **Then it stalled again**, one step further in: after the tool result came back, the
  Orchestrator's next turn (to show the plan and call `ask_user "Do you approve this test plan?"`)
  again fell through to Gemini and hit the same `429 RESOURCE_EXHAUSTED` daily-quota error. The
  turn ended `FAILED` with no `ask_user` suspension ever recorded, so **no approval prompt was
  raised and Gate 6's `file` step never ran** - the draft (`draftId QA-be579c64`) exists only in
  the runtime's draft store; nothing was written to `.workspaces/KAN-36/qa/` and no Jira comment
  was posted. This is a real, unresolved instance of the same root cause: Groq's larger 10-tool
  Orchestrator schema is not 100% reliable even on `gpt-oss-120b` for every turn, and Gemini has no
  remaining daily quota to catch a miss right now.

**5. Stopped here rather than keep retrying blind.** Every failed turn spends real Groq/Gemini
quota; hammering it further wastes the very quota needed once it resets, for no evidence gained.
Gate 7 (Tester) was not attempted - it requires Gate 6 to be filed first (`delegate_to_test`
checks for `qaRecord.filed.workspaceWritten`), which never happened.

## Real evidence this answers about "the QA/Tester LLMs"

- The **QA Agent's own model** (`groq/openai/gpt-oss-120b`) is not the problem - it ran end to
  end for real (Jira read -> coverage matrix -> 5 real Playwright files) in about 2m40s once it
  got a turn.
- The actual fragility is in the **Orchestrator's** tool-calling reliability on Groq for its own
  10-tool schema, compounded by the **Gemini fallback being out of daily free-tier quota** - so a
  Groq miss currently has nowhere to land. Fixing the Orchestrator's model (step 3) removed one
  failure mode (qwen3.8-27b's near-100%-reproducible malformed tool call) but did not make every
  single turn reliable, and the fallback safety net is not currently available to absorb the rest.
- The Tester Agent (`groq/qwen/qwen3.8-27b`) was never reached this session - Gate 6 didn't file,
  so Gate 7 had nothing to run against. Its own reliability on Groq is unverified from this run.

## Decisions

- Changed `ORCHESTRATOR_MODEL_ID` to `groq/openai/gpt-oss-120b` (see registry.ts comment) based on
  live, reproducible evidence (3/3 failures on the old model, 0/1 on the new one against the same
  schema) - not a guess. Left `PO_MODEL_ID`/`DEV_MODEL_ID`/`TESTER_MODEL_ID` on `qwen3.8-27b`
  untouched since they weren't the ones observed failing; changing them would be an unverified
  guess, not a fix.
- Did not keep retrying Gate 6's approval turn once Gemini's daily quota was confirmed exhausted -
  further attempts could only fail the same way and would burn Groq attempts for nothing.

## Blockers / open questions

- Gemini's free-tier quota (`generate_content_free_tier_requests`, 20/day, `gemini-3.5-flash`) is
  exhausted account-wide as of this run; it resets on Google's own daily cycle, not something AURA
  controls. Until then, any Groq tool-call miss on *any* agent has no fallback.
- Gate 6 for KAN-36 is left mid-flight: a real, good test plan exists in the draft store
  (`QA-be579c64`) but was never approved or filed. Re-sending "Approve" (or re-running the whole
  request) to the same thread (`qa-tester-evidence-KAN-36` / resource `qa-tester-evidence-user`)
  will resume it once quota/tool-call reliability allows a turn to complete.
- Gate 7 (Tester, real Docker execution against KAN-43/KAN-45) was not attempted - blocked on
  Gate 6 filing first.

## Next

- Retry the same thread once Gemini's daily quota has reset (or swap in a working paid key) to get
  past the `ask_user` approval turn, then file Gate 6 and proceed to Gate 7 for real.
- If Orchestrator turns keep intermittently failing on Groq even on `gpt-oss-120b`, consider
  whether the Orchestrator's 10-tool schema is simply too large for reliable free-tier Groq
  tool-calling, independent of which specific model is used.
