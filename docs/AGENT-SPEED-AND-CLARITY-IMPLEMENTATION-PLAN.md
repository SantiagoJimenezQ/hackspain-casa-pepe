# Faster incident response and clearer decisions

Status: local implementation completed, 2026-09-19. Decision rendering/history, timing, combined dispatch, compact intent and consolidated observation reads are implemented locally. New model tools default off for rollout. Live provider benchmarking, deployment and browser validation remain release checks. Based on the current local checkout, including uncommitted backend visibility work; deployment and live latency have not been verified.

## Outcome

Reduce incident-to-first-external-action latency and make the selected action, evidence, tradeoff, waiting condition and plan changes understandable without opening tool JSON. Preserve model-selected priorities, human approval, capacity/dependency checks, independent verification and auditable adaptation.

The critical path should become:

`incident → authoritative briefing → model selects plan + first step → validation → persistence → fresh execution checks → approval or external dispatch → verification/reassessment`

Approval requests and saved plans are useful progress, but do not count as external action. Track first external dispatch and successful external completion separately.

## Verified starting points

- `apps/server/src/agent/llm/llm-loop.service.ts` permits exactly one tool call per model turn. `propose_plan` saves only; `execute_step` takes another model turn. Every turn already receives authoritative state and durable evidence.
- `apps/server/src/agent/services/agent.service.ts` responds to incident, approval and tool-result events. Its five-second timer handles timeout work; reducing it is not the primary optimization.
- `observeForLlm` performs serial reads before a parallel evidence fetch. Approval data is queried both for rejected constraints and the evidence list. The loop observes before and after model work and mutation callbacks recheck state.
- `apps/web/src/lib/agent-trace.ts` builds tool, task, approval and thinking entries, omitting model decision text. `agent-panel.tsx` renders priority rank/name/decision but not the available priority reason, assumptions or plan changes.
- Local backend changes already provide public turn text, dispositions, `outputIdentifier`, redaction, SSE and paginated LLM history. Integrate this work; do not replace it. See [existing visibility plan](LLM-RESPONSE-VISIBILITY-PLAN.md).
- Existing Jest loop tests cover invalid arguments, stale responses, pending incoming reports, turn budgets and provider failure. Existing Vitest tests cover transcript tools and dashboard event handling. Extend these suites instead of duplicating their assertions.

## Delivery order

| Phase | Deliverable | Depends on | Exit condition |
| --- | --- | --- | --- |
| 1 | Decision transcript, priority explanations and specific wait states | Existing local visibility contract | Operator sees why/what/what changed; history survives refresh |
| 2 | Correlated timing and baseline capture | Existing activity records | Machine time and human waiting are separately measurable |
| 3 | Plan plus selected first step in one model turn | Phase 2 | One fewer model request before dispatch or approval; all guard tests pass |
| 4 | Compact model plan intent and authoritative briefing | Phase 3 | Smaller generated plans with equivalent validated behavior |
| 5 | Consolidated observation reads and model-profile comparison | Phase 2; rerun after Phase 4 | Fewer redundant reads; measured latency improvement without quality regression |

Each phase should be independently reviewable. Preserve unrelated local edits. Update shared contracts before producers and consumers. Do not add a second runtime, autonomous subagents, blanket parallel action dispatch or automatic approval.

## Phase 1: expose decisions and their consequences

### Data and rendering

Extend `packages/contracts/agent.d.ts` additively where needed; keep old events readable. Add a pure decision reducer in `apps/web/src/lib/agent-decisions.ts` and call it from `agent-trace.ts`. Extend the transcript union with a decision entry. Identify a turn by `(runIdentifier, outputIdentifier)`, not `turn`, which restarts between cycles.

Deduplicate events by run and sequence, process fragments in sequence order, replace provisional text with completed text, and apply the highest-sequence disposition. A late fragment must not downgrade a completed record. Keep rejected, stale and incomplete records inspectable. Legacy events without an output ID use their event identifier and summary; never invent correlation or missing explanation.

Render public summaries in `agent-panel.tsx`, with expandable tool arguments and provider metadata. Public content is untrusted text. No executable HTML or private reasoning. Preserve full text behind expansion. Show missing text as “No explanation provided” with the proposed action, not generated filler.

Add a small current-decision view using authoritative plan/step data:

- Next action and owner.
- Why now: selected step reason and relevant priority reason/business impact.
- Evidence and uncertainty: confirmed facts, source/time, plan assumptions. Only show explicit evidence links; do not infer that a nearby event supports a decision.
- Capacity and blocked dependencies, including postponed services and their reasons.
- Waiting for: named approval, incoming-report confirmation, active external call, or recorded `wait_for_input` reason.
- What changed: `changesFromPrevious`, with the plan version.

Model disposition and operational status are different fields. “Accepted” means the runtime accepted the model call; “executing” requires a running tool/action and “verified” requires successful independent verification. A stale/rejected historical decision cannot become the current-action card. Add optional plan/step/runtime-tool correlation to the public-turn contract if existing envelope fields are insufficient; never join by timestamp alone.

Add a server-side proxy at `apps/web/src/app/api/casa-pepe/activity/llm/route.ts` for the existing cursor history endpoint. Retain the API key on the server. Merge history and SSE in `dashboard-provider.tsx`, using a separate bounded decision store and explicit “Load older” control; the existing 100-event activity window must not silently erase visible decisions. On run changes, clear old state and ignore late fetch responses from the previous run. Use initial history plus buffered/live SSE merging, not a fetch-then-subscribe gap.

### Exact tests (Vitest / Testing Library)

| ID / target file | Fixture and action | Required assertions |
| --- | --- | --- |
| V01 `agent-decisions.test.ts` (new) | Run A/output X: fragments seq 10=`Recover ` and 11=`orders`; receive `[11,10,11]` | One entry; text exactly `Recover orders`; no duplicated fragment |
| V02 same | V01 followed by final text `Recover orders first`, pending seq 12 and accepted seq 13; replay fragment 10 | One entry, exact final text, accepted; no appended draft or status downgrade |
| V03 same | Parameterize terminal disposition rejected/stale/incomplete with a reason | Reason retained; entry remains history; never selected as executable current work |
| V04 same | Two cycles both turn 0 with output IDs X/Y; another run reuses X | X/Y stay distinct within their run; old-run entry absent from active view |
| V05 same | Final tool-only response with `text: null`; legacy event without output ID | No invented explanation; tool visible; legacy summary readable without exceptions |
| V06 `agent-trace.test.ts` | Decision selects step S; S has pending approval, then running tool, then successful execute result without verify, then successful verification | States respectively await approval, executing, awaiting verification, verified; accepted decision alone never says executed |
| V07 `agent-panel.test.tsx` (new) | Plan v2 with 7 capacity units, postponed tracking, priority reasons, assumptions and a v1→v2 change | Visible reason, capacity, postponed rationale and change; no need to expand raw tool JSON |
| V08 same | Specific wait reason and provider failure; separate fixtures | Exact wait reason or actionable failure displayed, not endless “Preparing the next step” |
| V09 same | Public text `<img src=x onerror=alert(1)>` and a 3,000-character explanation | No injected image/handler; complete text available after expanding; redacted records labeled |
| V10 `dashboard-provider.test.tsx` | History page overlaps SSE on seq 10–13; latest terminal update arrives before older page resolves | One turn; latest terminal state survives; no lost entries or duplicated tools |
| V11 same | Load >100 activity events, then older decision page; reset to run B while A history request is pending | Decisions remain recoverable; late A result cannot populate B; cursor exhausted disables older load |
| V12 `activity/llm/route.test.ts` (new) | Mock backend success, failure and malformed cursor/limit input | Expected validated query forwarded, server auth attached, key absent from response, upstream failure handled consistently with existing proxies |
| V13 `agent-panel.test.tsx` | Navigate expand/history/approval buttons by keyboard with user-event | Controls have accessible names and operate by keyboard; no duplicate approval submission while busy |

## Phase 2: measure before optimizing

Add a clock-injected timing helper (`apps/server/src/agent/llm/decision-timing.ts`) and additive typed timing payloads. Correlate by run, cycle, triggering event, output ID, plan version and step/tool ID. Record UTC timestamps for cross-event milestones and monotonic elapsed durations inside a process. Emit one terminal timing record per model request, including failed/stale/rejected outcomes. Do not log prompts, credentials, transcripts or raw provider errors.

Milestones: incident applied; decision request start/end; observation start/end; validation/save start/end; approval requested/decided; external dispatch accepted; external completion; verification complete; changed evidence applied; replacement action dispatched. Capture model profile, tokens when available, model-request count before action, rejected/stale counts and observation read counts. Missing values are null/unavailable, not zero.

Report event-to-first-external-dispatch, approval-to-dispatch and changed-evidence-to-revised-dispatch. Also report end-to-end elapsed time and union of blocked human-wait intervals; overlapping approvals must not double-count waiting. Stage spans may overlap, so do not sum them into an asserted wall time. Existing model-test endpoint is a provider smoke test, not an incident latency benchmark.

### Exact tests (Jest)

| ID / target file | Fixture and action | Required assertions |
| --- | --- | --- |
| M01 `decision-timing.spec.ts` (new) | Inject monotonic clock 100→350 ms and fixed UTC clock | Model elapsed exactly 250 ms; correlation IDs retained; no dependence on wall-clock sleeps |
| M02 same | Approval waits [100,400] and [200,500] in a 1,000 ms interval | Human waiting 400 ms, remaining elapsed 600 ms, not 400 ms |
| M03 same | Plan save at 100, approval request 200, external dispatch 800, completion 900 | First external dispatch is 800; plan/approval not counted as action; completion separately 900 |
| M04 `llm-loop.service.spec.ts` | Success, provider throw, stale response and invalid tool response, parameterized | Exactly one terminal timing per request with correct outcome; unavailable usage stays absent |
| M05 `decision-timing.spec.ts` | Reset A→B; late A completion, missing dispatch, backward UTC adjustment | No A/B cross-correlation; incomplete metric remains unavailable; monotonic duration nonnegative |

## Phase 3: save and begin the model-selected step

Add a single declared tool `propose_plan_and_execute` with `{ plan: PlanDraft, firstStepIdentifier: string }`. Preserve `propose_plan` for planning without dispatch and `execute_step` for existing plans. Keep exactly-one-tool-call per response. Update the public-output allowlist/redaction for the new tool before exposing it. Gate its availability with a proposed backend flag `AGENT_COMBINED_PLAN_ACTION_ENABLED`, initially false; validate configuration and document it in `.env.example` using no credentials.

Add a dedicated orchestration operation in `AgentService`; do not implement as naive `save(draft, oldState); execute(id, oldState)` because saving changes the fingerprint.

1. Validate draft, selected-step existence/runnability, action budget, dependency graph and authority using existing validators. A selected step may require approval, but must not already be running/completed/rejected or blocked on another step.
2. Check the original authoritative state is still valid before saving. Persist through existing plan/version machinery, preserving dispatched work and superseding obsolete approvals.
3. Build expected post-save state from the pre-save evidence and precisely the authorized persistence effects: saved plan/version and initial responding transition. Do not blindly accept all newly observed facts as the expected baseline. Enumerate internal save side effects during implementation; compare all external decision evidence unchanged.
4. Reobserve and compare against that expected post-save state. Recheck active run, incoming report gate, plan identity/version, selected-step status, capacity, dependencies and approval. New external evidence or a competing plan blocks dispatch and queues reassessment. A saved plan can remain saved even when dispatch is blocked; record this partial result explicitly.
5. Invoke the existing guarded execution path. Approval-required steps create their normal version-bound approval request and do not call the external recovery adapter. Persisted execution identity must use existing step/attempt idempotency, not a random key per retry.
6. Return `{ planIdentifier, planVersion, selectedStepIdentifier, dispatchStatus, approvalIdentifier?, toolCallIdentifier?, reason? }`, where dispatch status is awaiting-approval, dispatched or blocked. Provider/tool failure remains failure; never claim atomic rollback of an external action.

Do not assume the in-process cycle gate proves distributed exactly-once dispatch. Retain existing deployment guarantees and explicitly document that limit. A completed approved callback can still require a model turn in this phase; automatic approval-to-dispatch without reassessment is out of scope.

### Exact tests (Jest)

Use deferred promises to place changes at precise boundaries. Mock `LlmClientService.complete`, but exercise real orchestration and validation; a test that only checks two mocked callbacks were called is insufficient for guard behavior.

| ID / target file | Fixture and action | Required assertions |
| --- | --- | --- |
| C01 `llm-loop.service.spec.ts` | Valid combined response selects runnable step S, then wait response | S is attempted before second model request; one model request before action versus two in legacy propose/execute fixture |
| C02 same | Model selects runnable second step S2 although independent S1 is first in plan order | Only S2 selected; runtime does not substitute S1 |
| C03 `agent.service.spec.ts` | Combined plan selects approval-required recovery S | Plan persisted once; one pending version-bound approval; external adapter called zero times |
| C04 same | Deferred model/save boundary; confirmed capacity changes 12→7 before save | No stale plan persisted; no adapter call; reassessment recorded |
| C05 same | Plan saved at v2; before dispatch, capacity changes 12→7 | Plan remains auditable; result blocked/stale with reason; zero adapter calls; follow-up requested |
| C06 same | Only save effects occur: previous plan→v2 and initial impacted→responding transition | No false stale rejection; selected eligible step dispatches once |
| C07 same | Parameterize reset, pending incoming report, competing plan v3, dependency regression between save and dispatch | Each prevents dispatch; no stale approval creation or action against the replaced run/plan |
| C08 `llm-loop.service.spec.ts` + `plan-validation.spec.ts` | Missing selected ID, blocked dependency, over-capacity draft, unauthorized owner, or exhausted action budget | Reject before mutation; reason returned safely; no plan save or execution |
| C09 `agent.service.spec.ts` | Duplicate trigger while first combined cycle is held; duplicate tool callback after dispatch | One execution for the same run/plan/step/attempt; completed state not regressed; queued follow-up remains bounded |
| C10 same | Persistence throws; separate fixture adapter throws after successful save | First: no dispatch. Second: saved plan retained, failure visible, no automatic duplicate external retry |
| C11 same | Approval belongs to v1 while selected recovery is v2; operator rejects v2 | v1 approval cannot authorize v2; rejection prevents recovery and informs next state |
| C12 `public-output.spec.ts` | Combined args contain configured credential canary, unknown fields and engineer contact values | Public projection follows existing redaction policy; no credential canary in any activity payload |
| C13 `llm-loop.service.spec.ts` | Combined flag false; existing propose/execute sequence | Combined tool absent; legacy behavior preserved; same guard outcomes |

## Phase 4: smaller decisions, less repeated investigation

Introduce `PlanIntent` as a model-facing schema in `apps/server/src/agent/llm/plan-intent.ts` and a deterministic `materializePlanIntent` adapter. Keep persisted `PlanDraft` and its existing validator as the execution boundary. The model supplies summary, assumptions, priority choices/reasons, intended actions, dependency references, owner roles, investigation questions and selected first action. It does not supply run IDs, contact details, approval IDs, execution status, timestamps, attempt counters or computed resource totals.

Define stable action references `(serviceIdentifier, actionKind, localKey)` for new actions; explicitly reference existing step IDs when retaining work. Reject duplicate references and unknown services. Server resolves configured contacts, generates canonical step IDs, copies running/completed steps exactly, calculates totals from authoritative service/resource costs, sets new-step defaults and applies mandatory approval flags. Preserve all model choices and reasons; do not introduce a hidden rule-based prioritizer. Materialization must not silently fix an infeasible plan.

Replace redundant context with a concise authoritative briefing: current service/dependency/capacity facts with observation timestamps and confirmed/claimed status; active plan; unresolved constraints; recent relevant tool results; operator decisions and relevant learning. Retain rejected-approval constraints, failed-action evidence and pending-report gates. Historical learning must not override current confirmation. Document each removed duplicate field.

Prompt the model to act from supplied current facts and investigate missing/conflicting facts. Keep explicit read tools available and retain independent verification. Do not prohibit rereads after changed evidence. Use a separate rollout flag for compact intent so legacy plans remain readable and executable during rollback.

### Exact tests (Jest)

| ID / target file | Fixture and action | Required assertions |
| --- | --- | --- |
| P01 `plan-intent.spec.ts` (new) | Intent restores orders (4 units) and routing (3), postpones tracking (2), confirmed capacity 7 | Valid materialized total 7, remaining 0; original priorities/reasons retained; server-owned IDs/defaults/approval flags correct |
| P02 same | Previous orders step completed and routing running; model omits or changes their execution fields | Existing dispatched steps preserved exactly; unsafe contradictory intent rejected, never reset to proposed |
| P03 same | Unknown service, duplicate action reference, dependency cycle, aggregate 8 against capacity 7 | Each rejected before persistence; no silent truncation or reordering into a feasible plan |
| P04 same | Committed work already exceeds newly confirmed capacity; model adds extra recovery | Committed work retained; additional allocation rejected; conservative assumption allowed only within validator rules |
| P05 same | English/Spanish intent with configured engineer identity and arbitrary model-supplied contact field | Language/reasons preserved; configured identity used; prohibited field rejected |
| P06 `llm-context.spec.ts` | Fresh capacity 7, historical lesson 12, rejected approval and failed recovery | Briefing includes fresh fact, uncertainty/source, rejection and failure; lesson explicitly historical; no simulation future or credentials |
| P07 `llm-loop.service.spec.ts` | Scripted combined plan uses complete briefing with no read calls; second fixture changes capacity and asks for a read | First dispatch succeeds without redundant reads; second read is allowed and returns current evidence |
| P08 `plan-intent.spec.ts` | Equivalent legacy draft and compact intent | Both validate to semantically equivalent priorities, allocations, ownership and actions, ignoring generated IDs/timestamps |

P07 proves runtime capability, not that a live model will avoid redundant reads. Verify actual model behavior in the benchmark.

## Phase 5: fewer database round trips and measured model selection

Refactor observation to read incident, latest plan and independent evidence concurrently where safe. Query approvals once per observation and derive rejected constraints from that result. Resolve capacity learning from the same fetched learning data where semantically equivalent. Remove the loop's redundant initial observation if its result is overwritten before use. Return immutable snapshot objects so later service mutation cannot alter the model's expected state in place.

Do not reuse a pre-model snapshot at dispatch. Keep post-model and pre-mutation checks. Do not add a cached revision fast path until every decision-relevant writer participates in a durable revision scheme; that larger change is outside this plan. Consolidation must not weaken current consistency guarantees.

Compare configured model/reasoning profiles using the same scenario runs and validation criteria. Select a faster profile only on evidence; do not hardcode an unverified provider/model recommendation. Keep a single explicit coordinator rather than adding more model calls for routine routing. Leave stream-persistence architecture unchanged unless Phase 2 shows it materially blocks completion.

### Exact tests (Jest)

| ID / target file | Fixture and action | Required assertions |
| --- | --- | --- |
| O01 `agent.service.spec.ts` | One observation with mixed pending/rejected approvals | Approvals queried once; evidence and rejected constraints match the same result; learning reads not duplicated |
| O02 same | Deferred independent repository promises | Independent reads start before release of each other; output waits for all required evidence; no sleep-based duration assertion |
| O03 same | Mutate repository fixture after observation; new capacity arrives during model call | Previous snapshot unchanged; subsequent observation sees new capacity; stale guard blocks dispatch |
| O04 same | Approval/capacity evidence read rejects | No partial authoritative snapshot, plan save or dispatch; failure visible |
| O05 `llm-loop.service.spec.ts` | One decision followed by wait | No discarded initial observation; post-model and mutation guards still occur; assert semantic guard behavior, not arbitrary total reads across unrelated operations |

## Integration and performance acceptance

Extend `apps/server/src/agent/agent-flow.spec.ts` using existing in-memory repositories and scripted model responses. Keep these separate from unit tests:

1. Impact → combined investigation plan → engineer call → capacity twist → revised plan → approval → recovery → verification → learning. Assert version correlation and preserved in-flight work.
2. Twist during a pending combined decision: no over-capacity dispatch, revised priorities visible, obsolete approval invalidated.
3. Reject recovery, then emit duplicate callbacks and reset: no forbidden/repeated recovery and no old-run contamination.
4. Refresh/reconnect UI during provisional output, then receive accepted/stale terminal update: one accurate decision, correct action state and recoverable older history.

Create a benchmark script under `demo/` and results template recording commit/dirty-checkout identity, scenario/seed, provider/model profile, flags, simulation/live-adapter mode and run count. Use simulated adapters with fixed completion times and automated approval delay for comparable machine-latency runs; separately report a human-operated rehearsal. No real calls or emails are needed for unit or benchmark acceptance.

Capture at least 20 baseline and 20 optimized runs per candidate profile, alternating profiles where practical. Report median, p95 and failed-run counts; never drop failures from quality reporting. Twenty runs provide directional p95 evidence, not a production latency SLO. Target at least 25% lower median incident-to-first-dispatch with no observed p95 regression, no new invalid dispatches, and no loss of decision quality. Treat this as a release target to validate, not an established result.

Deterministic structural gate: when complete evidence permits action, combined path needs exactly one model completion before first dispatch/approval versus two for legacy propose + execute. Do not assert overall recovery completes in a fixed number of turns. Compare outcomes against scenario constraints, not a hardcoded ordering where multiple valid plans exist. Live-model evaluation must check dependencies, capacity, appropriate investigation, evidence-backed rationale, operator rejection and adaptation.

Browser acceptance: operator can identify next action, reason, capacity constraint, waiting owner and plan change without expanding JSON, in both scenario languages; verify at desktop and narrow viewport. Streaming may improve perceived progress but is not proof of reduced dispatch latency.

## Validation commands and release checklist

Run targeted Jest suites during backend implementation, then the full backend checks from repository root:

```sh
pnpm --filter @casa-pepe/server test -- --runInBand
pnpm --filter @casa-pepe/server typecheck
pnpm --filter @casa-pepe/server lint
pnpm --filter @casa-pepe/server build
pnpm --filter web check
```

Use the existing pnpm workspace tooling; if wrapper execution stalls, use the package-local binaries as documented in the server README. Tests must use mocked providers, existing in-memory repositories, deferred promises and injected clocks. Never add credentials or call live external integrations in unit tests.

Before enabling combined dispatch, all C-series tests and existing stale-state/approval/capacity/idempotency tests must pass. Before enabling compact intent, all P-series tests and semantic-equivalence scenarios must pass. Before calling the work complete, verify deployed endpoint/event compatibility and browser rendering separately from local tests.

Update `apps/server/docs/LLM-AGENT.md`, `apps/server/docs/API.md`, shared contract documentation and the visibility plan status as each phase lands. Roll back the new tool/intent flags independently; leave existing stored plans and public decision history readable. Do not roll back approval, verification or stale-state checks to meet a latency target.


## Local implementation result

All five implementation phases are present. Combined and compact tools remain independently disabled by default; no deployment, live calls, emails or provider-profile changes were performed. Shared public-turn records now include optional combined action results, and the timing contract is additive.

Automated checks: 309 backend tests across 47 suites, 142 frontend tests across 20 suites, and four standalone metric-analyzer tests passed during implementation. The complete incident integration suite runs in legacy, combined and compact modes. Both production builds and typechecks passed; final lint checks are recorded in the task response. Test HTTP servers require loopback access outside the restricted sandbox.

Tests reuse existing capacity, approval, stale-run and idempotency suites alongside the new decision reducer, history proxy, card, observation, combined-operation, intent and timing cases. Actionable provider failures show a paused state. Two tasks for one service retain distinct semantic keys rather than colliding on a single task ID.

Live decision buffering is bounded to 500 turns. Explicitly requested history pages are retained separately; refreshing history restarts pagination so records outside the live window remain retrievable. Historical actions are not inferred to be verified from accepted model output.

Remaining release verification: the Browser runtime could not discover an in-app browser backend, so rendered desktop/mobile QA was not completed. Capture the 20+20 live-provider benchmark runs described in `demo/AGENT-LATENCY.md` before claiming the target percentage improvement or selecting a faster model profile. Local scripted tests establish one fewer model request before eligible combined actions, not a measured live latency percentage. Deployment verification remains separate from local validation.

PR integration preserves current-main specialist delegation, plan repair, task follow-up, approval configuration and per-run dashboard state. It replaces automatic multi-page history prefetch with one initial page and explicit pagination. Commander request timing includes specialist work in action time; specialist requests do not produce separate timing samples.
