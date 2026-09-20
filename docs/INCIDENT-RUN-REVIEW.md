# Incident run review — 19 September 2026

Run: `run_27555eef-d770-442f-a2cc-447c7ae4bb8b`. Code reviewed against main
`721199b`, in feature branch `codex/incident-run-review`.

## Evidence and limits

The supplied debug export ends mid-field during the real call record. Its final
snapshot shows cycle 3/60 idle, incident responding, plan v2 completed, two
completed tool steps, and all six service priorities postponed or waiting on
service dependencies. It does not include the later transcript that produced v2.
This review distinguishes that snapshot from the visible chronological trace.
The raw export contains personal contact details and is not copied into the repo.

The visible trace contains four rejected plans (unknown blocker, duplicate
service priority, self blocker, incorrect top-level fields) and two stale model
results. The first visible delegation is at 16:12:59 UTC; the accepted plan is at
16:13:50; the real call starts at 16:14:08 and finishes at 16:14:51. Approximately
70 seconds elapsed from first delegation to call dispatch. That is wall-clock
latency, not proof that all of it was model computation.

## Findings and applied changes

| Priority | Finding | Evidence and change |
| --- | --- | --- |
| P1 | Human follow-up could leave the agent stranded. | `TasksService` emitted `TASK_UPDATED`, but `AgentService` did not subscribe, and its model evidence omitted task records. Added subscription and current task status/notes to every observation. Task notes remain untrusted reports; they do not directly change capacity or authorize recovery. |
| P1 | Finishing investigation tools looked like a completed response plan. | Snapshot v2 is completed while all priorities remain unresolved. Both runtime completion checks previously considered only proposed, approved, awaiting-approval and running steps. They now also require settled priorities, completed steps and no outstanding human tasks in the run. Existing partial-recovery integration assertions now expect an active plan. |
| P1 | The call objective did not match the provider capability. | The plan promised snapshot/readiness/capacity answers, passed `questions: []`, and received permissions with zero confirmed technical facts. Main already documents the ElevenLabs limitation for the commander, but the caller specialist still instructed technical question design without provider context. Added provider/mode/capability evidence and caller guidance for the permissions-only flow. This is model guidance, not a guarantee of the wording of every future plan. |
| P2 | Avoidable schema errors delayed the first external action. | Four rejected attempts are visible. Added explicit one-priority-per-service and service-dependencies-only blocker guidance, plus uniqueness and explanatory schema metadata for `blockedBy`. Validation remains strict; no invented facts or silently accepted invalid blockers. Main already repairs postponed-capacity bookkeeping. |
| P2 | Waiting and delegation were overclaimed. | v2 assigns platform coordination to the configured customer-support contact, then waits without visible delivery. Added guidance that task creation is only a persisted assignment, to reuse outstanding tasks, respect role limits, and identify the owner and resumption path in wait explanations. |

## Improvements still requiring implementation or live proof

1. **Obtain technical evidence through a working channel.** The current ElevenLabs
   flow cannot answer technical questions. Add an authenticated platform report or
   telemetry adapter for available capacity, snapshot age/usability, and service
   readiness, with source, timestamp and confirmation status. Do not turn voice
   permission into technical confirmation. Acceptance: a real report reaches this
   run, wakes the agent, changes the plan and allows the normal approval path.
2. **Make escalation reach a person.** `assign_task` persists local work; it does
   not deliver a ticket, email or page. Add a configured technical escalation
   recipient, real delivery receipt, acknowledgement and timeout. Support can
   coordinate a handoff but is not automatically the technical owner. Acceptance:
   the recipient receives the request and their response is visible to the agent.
3. **Investigate alternative resources before concluding nothing fits.** The
   snapshot uses a historical one-unit assumption for Oman while Bahrain and
   Riyadh are only mentioned in a task description. Historical observations can
   justify caution but are not current confirmation. Require fresh evidence for
   each viable region and explain the selection. The visible export does not
   prove whether earlier omitted reads checked those alternatives.
4. **Separate incident communication from recovery readiness.** The snapshot says
   no communication until technical evidence arrives, although the call summary
   reports permission to notify. Technical uncertainty need not prevent a factual
   operator update about confirmed impact and next steps. Structured permissions
   must be checked independently: the truncated export does not prove their exact
   values. The built-in email goes to the operator, not all customers. Commander
   guidance now makes this distinction; delivery still needs a live rehearsal.
5. **Expose the waiting condition clearly in the UI.** Show what is missing, who
   owns it, how to submit evidence, and whether a message actually reached that
   person. The backend fix keeps the plan active; the UI's idle label and tool-step
   count are not redesigned here.
6. **Explain stale-result invalidation.** Two stale responses are visible. Keep the
   dispatch safety check, but include which state category changed in public
   diagnostics. The export alone cannot show whether these were meaningful new
   facts, asynchronous completion, or avoidable observation churn.
7. **Align provider incident wording and debug privacy.** This historical review predates the switch to missile wording in new runs. The call summary says
   missile impact while the incident is a meteorite. Inspect the deployed voice
   prompt and actual transcript before assigning the cause. The export redacts
   some model arguments but exposes the phone in the expanded final plan; make
   export redaction consistent without removing operator access to needed data.

## Validation

Validation passed: 42 backend suites / 261 tests, TypeScript checking, and Biome
checking of changed TypeScript files. Biome used a temporary copy with the
unchanged server configuration because direct worktree invocation reported a
nested-root configuration conflict. HTTP tests were rerun with loopback binding
allowed after the sandbox denied listeners.

Regression tests cover unfinished priorities, failed/rejected/postponed steps,
open human work, task-triggered reassessment, fresh task notes, provider capability
projection, and both in-memory and HTTP incident walkthroughs. The existing
backend suite exercises approvals, stale results, provider adapters and recovery.
No live provider calls, messages, database writes or deployment were made for
this review. Passing scripted tests does not establish improved live model
latency or successful recovery of the supplied run.


## Follow-up: simulated run stalled before recovery dispatch

Run `run_3069b36f-275b-4326-b694-e6c9a923c563` was still in cycle 1, with
plan v1 active, one completed call and one postponed status publication. The
export contains no dispatched `execute_recovery` tool. Its health checks and
engineer result explicitly report `mode: simulated`. A read-only check of
`https://casa-pepe-api.vercel.app/api/health` on 19 September also returned
`engineerCalls: simulated` and `recoveryEnvironment: simulated`; the operator
confirmed that simulation is intended. No HTTP recovery target is needed for
that mode: simulated recovery updates the persisted incident through NestJS.

Three blockers are visible:

- An initial plan tried to verify a service that was not selected for recovery.
  The validator correctly rejected that inconsistent plan.
- Later revisions rewrote the completed call's reason and result metadata while
  claiming to preserve them. Validation rejected both revisions. The repair layer
  also ran mechanical rewrites on committed steps. It now restores steps by ID
  from trusted running/completed history before both repair passes. The strict
  validator, approval checks, new-work validation and stale-state guards remain.
- The simulated call had `questions: []`, so it returned zero answers, yet its
  canned summary claimed snapshot/readiness confirmation. Simulation now
  summarizes only the answers it actually generated, and explicitly reports an
  empty call as no evidence. Commander guidance now distinguishes simulated
  keyed technical questions from the live ElevenLabs permissions-only flow.

The repeated capacity reads returned unconfirmed resources each time. Oman was
reported as four units, reduced to a one-unit planning assumption from historical
lessons; Bahrain and Riyadh had twelve reported units but were also unconfirmed.
Reading capacity does not change its confirmation status. In a manual run the
operator must introduce the scenario's capacity update through the Demo controls
(`POST /api/demo/twist`) or submit and confirm a capacity report. Technical facts
must be obtained through keyed simulated questions or explicit reported evidence;
plan-specific operator approval still applies. The agent must state that wait
condition, not imply that a successful read or a call summary performed recovery.

Authenticated follow-up confirmed 12 successful tool records, zero recovery actions,
zero approvals, and eight rejected proposals. Four rejections concerned rewritten
committed steps; two later rejections used an old timestamp on uncommitted steps.
The latter is now derived from the current incident timestamp during repair. The
remaining rejections were verification of a non-recovery priority and selection
of a non-runnable/stale action. Both remain correctly guarded. The run is now
inactive/reset. Its wait text asked for approval despite no pending approval
record; guidance now requires creating the valid recovery step and requesting
its approval before asking the operator to approve it.

Follow-up validation: 43 suites / 268 backend tests passed, including simulated
recovery state changes through the incident flow and HTTP walkthrough. New
regressions cover rewritten completed calls, running recoveries, and empty,
partial and unknown simulated question answers. These code fixes are local on
`codex/fix-recovery-plan-dispatch`; the deployed run was not reset, advanced,
reconfigured or redeployed during diagnosis.

Before opening the follow-up PR, main's new nonempty-question validation was
merged. Commander and caller guidance now require a keyed question for new
plans while distinguishing simulated technical answers from live ElevenLabs
permissions. Already completed empty-question calls remain immutable history.
