# API reference

Base URL: `http://localhost:3000/api`. Interactive OpenAPI documentation at `http://localhost:3000/documentation`.

Every response is JSON. Identifiers carry a prefix: `run_`, `inc_`, `plan_`, `apr_`, `task_`, `tool_`, `call_`, `rec_`, `act_`, `whs_`, `whd_`, `hev_`, `fact_`, `dec_`.

## Authentication

| Scope | Header | Who |
|---|---|---|
| `operator` (default) | `Authorization: API <API_KEY>` | Frontend, operator and demo controls |
| `public` | none | `/health` and inbound webhooks (they verify their own secret) |

Without a valid credential: `401` with `{ "statusCode": 401, "message": "An API key is required" }`.

Browser `EventSource` clients cannot set headers: `GET /activity/stream` also accepts the key as the `apiKey` query parameter.

## Error format

```json
{
  "statusCode": 409,
  "error": "Stale Run",
  "message": "Run run_… is no longer active, late results are ignored",
  "details": [],
  "path": "/api/webhooks/recovery",
  "correlationIdentifier": "…",
  "timestamp": "2026-09-18T19:21:00.000Z"
}
```

Common errors:

| Code | `error` | When |
|---|---|---|
| 400 | `Bad Request` | Body or query validation (`details` lists the fields) |
| 401 | `Unauthorized`, `Invalid Signature` | Missing API key, or the inbound webhook secret does not match |
| 404 | `Not Found` | Unknown identifier |
| 409 | `No Active Run` | No active run; call `POST /demo/start` first |
| 409 | `Invalid State Transition` | Deciding an approval that is already decided or superseded, duplicated call result |
| 409 | `Stale Run` | Late result from a run that was reset |
| 502 | `Integration Failure` | Unexpected response from a voice provider or the recovery environment |

## Common parameter `runIdentifier`

List queries accept `?runIdentifier=run_…`. When omitted they use the active run. Without an active run they return `409 No Active Run`.

---

## Health

### `GET /health` (public)

Checks the Postgres (Supabase) connection and returns the integration modes.

```json
{ "status": "ok", "info": { "database": { "status": "up" }, "integrations": { "status": "up", "engineerCalls": "simulated", "recoveryEnvironment": "simulated" } } }
```

---

## Scenarios (`/scenarios`)

### `GET /scenarios`

`[{ identifier, language ("en" | "es"), title, company, region, backupRegion, serviceCount, reportedCapacity, capacityAfterTwist }]`. Two identifiers exist today: `meteorite-eu-west-1` (English, default) and `meteorite-eu-west-1-es` (Spanish). The scenario language drives every operator-facing text produced by the agent.

### `GET /scenarios/:identifier`

Full definition: services with dependencies and recovery actions, backup resource, initial facts, engineer briefing (questions and scripted answers) and the twist.

---

## Demo controls (`/demo`)

Separate from the operator controls. Each call returns the resulting `IncidentSnapshot` and emits activity events.

### `POST /demo/start`

Optional body `{ "scenarioIdentifier": "meteorite-eu-west-1" }` (or `meteorite-eu-west-1-es` for Spanish). Deactivates the previous run (it ends in `reset` state) and creates a new one with every service healthy. Events: `incident.run-started`.

### `POST /demo/impact`

Applies the meteorite: services become `down` or `degraded`, the initial facts are loaded and the incident becomes `detected`. The agent starts its first cycle: plan v1, engineer call and task assignment. Events: `incident.impact-detected`, `incident.event-applied`, `incident.status-changed`, `plan.created`, `decision.recorded`, …

### `POST /demo/twist`

Applies the scenario twist: the backup capacity is confirmed at 7 units. The agent revises the plan (v2), invalidates pending approvals and postpones what no longer fits. Events: `resource.capacity-changed`, `incident.event-applied`, `approval.superseded`, `plan.revised`, `decision.recorded`.

### `POST /demo/events`

Arbitrary harness event.

```json
{ "type": "meteorite-impact" }
{ "type": "capacity-limited", "availableCapacity": 9, "reason": "Another team released capacity" }
{ "type": "service-health-changed", "serviceIdentifier": "events-stream", "status": "healthy", "reason": "Recovered manually" }
{ "type": "fact-reported", "statement": "…", "factStatus": "confirmed", "source": "Platform team" }
```

`status` accepts `healthy | degraded | down | recovering`; `factStatus` accepts `confirmed | pending | refuted`. `capacity-limited` and `service-health-changed` trigger a plan revision.

### `POST /demo/reset`

Marks the current run as `reset` and creates a new one from the same scenario. Late results from the previous run (calls, recoveries) are rejected with `409 Stale Run`. Events: `incident.run-reset`, `incident.run-started`.

### `POST /demo/pause`

Pauses the automatic clock for a randomized run. It is idempotent. Manual controls, recovery actions and harness event injection remain available while paused. The incident must already be active (apply `/demo/impact` first). Returns `400` for a manual run or a run that has not entered an incident.

### `POST /demo/resume`

Resumes the automatic clock for a randomized run. The server advances approximately one simulated minute per second while an incident is active. The clock is paused when a run starts, so a demo must apply `/demo/impact` and explicitly resume it.

### `POST /demo/advance`

Advances a randomized run synchronously, even while paused. The incident must be active before the clock can advance.

```json
{ "minutes": 3 }
```

`minutes` is optional and must be an integer from 1 to 60. This endpoint is the preferred control for deterministic tests and recorded demos. It records `simulation.advanced` activity and may inject seeded secondary `service-health-changed` events, up to the configured disruption cap.

## Seeded simulation

Randomness belongs to the environment, never to the agent's decision policy. A run stores its complete simulation state in the incident row, including seed and draw counters, so reads do not change the next outcome. The same implementation version, start configuration and accepted action/clock sequence reproduce the same environment trajectory; UUIDs and wall-clock timestamps still differ.

`mode: "manual"` preserves the original fixed scenario. `mode: "randomized"` samples the initial backup capacity, recovery outcomes and a possible secondary disruption. Difficulties use these rules:

| Difficulty | Spare capacity | Recovery failure | Secondary disruption |
|---|---:|---:|---:|
| `easy` | 0–3 units | 0.2% base per recovery | 15% per eligible minute |
| `medium` | 0–2 units | 0.8% base per recovery | 30% per eligible minute |
| `hard` | 0–1 unit | 1.5% base per recovery | 50% per eligible minute |

The backup capacity never falls below one unit. Recovery failure probability increases with allocated capacity, up to three times the base rate at full utilization. A failed simulated recovery releases its allocation and records a failure reason; the agent can reassess and request a new cycle. Generated secondary disruptions only target currently healthy services, stop when the configured cap is reached, and respect the maximum number of concurrent unhealthy services. Manual `/demo/events` injections are independent of this budget.

The response's `simulation` object is:

```json
{
  "mode": "randomized",
  "seed": 42,
  "difficulty": "medium",
  "automaticEvents": true,
  "maxConcurrentDisruptions": 2,
  "paused": true,
  "elapsedMinutes": 0,
  "generatedDisruptions": 0,
  "initialDraws": 1,
  "recoveryDraws": 0,
  "disruptionDraws": 0
}
```

`automaticEvents` controls only the generated secondary fault. `pause` and `resume` control the clock. A manual `advance` call can generate the seeded fault while paused. Polling `GET /api/overview` or any other read endpoint never consumes random draws.

---

## Incident (`/incidents`)

### `GET /incidents/current`

`IncidentSnapshot` of the active run.

| Field | Content |
|---|---|
| `identifier`, `runIdentifier`, `runKind` (`live` \| `replay`), `sourceRunIdentifier` | Run identity |
| `status` | `normal` \| `detected` \| `responding` \| `partially-recovered` \| `recovered` \| `reset` |
| `active`, `startedAt`, `impactedAt`, `resolvedAt` | Lifecycle |
| `title`, `company`, `narrative`, `region`, `backupRegion`, `businessImpactSummary` | Context for the incident summary |
| `simulation` | Seed, mode, difficulty, pause state, elapsed minutes and persisted random draw counters |
| `services[]` | `identifier`, `name`, `status`, `statusReason`, `businessImpact`, `impactDescription`, `dependencies[]`, `recoveryCapacityUnits`, `recoveryActionKind`, `recoveryActionDescription`, `recoveryRequiresApproval`, `recoveryConsequences[]`, `lastChangedAt` |
| `resources[]` | `identifier`, `name`, `region`, `unit`, `totalCapacity`, `allocatedCapacity`, `confirmed`, `note` |
| `facts[]` | `statement`, `status` (`confirmed` \| `pending` \| `refuted`), `source`, `recordedAt` |
| `harnessEvents[]` | Events applied by the harness with date and source |
| `agentCycles` | Cycles executed by the agent |

### `GET /incidents/runs`

Runs, newest first: `runIdentifier`, `incidentIdentifier`, `runKind`, `status`, `active`, `startedAt`, `agentCycles`.

### `GET /incidents/runs/:runIdentifier`

`IncidentSnapshot` of a specific run, active or not.

---

## Overview for the UI

### `GET /overview?runIdentifier=`

The full initial state in one call.

```json
{
  "incident": { "…IncidentSnapshot" },
  "plan": { "kind": "plan", "plan": { "…PlanRecord" } },
  "pendingApprovals": [ "…ApprovalRecord" ],
  "tasks": [ "…TaskRecord" ],
  "engineerCalls": [ "…EngineerCallRecord" ],
  "toolCalls": [ "…ToolCallRecord" ],
  "recentActivity": [ "…ActivityRecord (latest 50)" ],
  "tools": [ { "name": "contact_engineer", "description": "…", "interaction": "real-call", "asynchronous": true, "simulated": true } ],
  "agent": { "…AgentStatus" }
}
```

`plan` is `{ "kind": "none" }` before the impact.

---

## Agent (`/agent`)

### `GET /agent/status`

```json
{
  "runIdentifier": "run_…", "incidentStatus": "partially-recovered",
  "cycles": 6, "maximumCycles": 60, "cycleInProgress": false,
  "planVersion": 2, "pendingApprovals": 0, "runningToolCalls": 0,
  "engineerCallMode": "simulated", "recoveryMode": "simulated",
  "lastCycleAt": "…", "lastCycleOutcome": { "kind": "completed", "planVersion": 2, "executedSteps": 1, "waitingFor": [] }
}
```

`lastCycleOutcome.kind`: `completed` \| `skipped` \| `limit-reached` \| `failed`.

### `POST /agent/cycle`

Optional body `{ "operatorName": "Luis" }`. Forces a decision cycle. Useful after `agent.limit-reached` or to resume a completed plan under new conditions. Returns the `CycleOutcome`.

---

## Plans (`/plans`)

### `GET /plans/current?runIdentifier=`

`{ "kind": "none", "runIdentifier": "…" }` or `{ "kind": "plan", "plan": PlanRecord }` with the latest version (active or completed).

### `GET /plans?runIdentifier=`

Every version, from 1 onwards.

### `GET /plans/:identifier`

A specific version.

**PlanRecord**

| Field | Content |
|---|---|
| `identifier`, `version`, `status` (`active` \| `superseded` \| `completed`), `previousPlanIdentifier` | Versioning |
| `decisionIdentifier`, `reason`, `triggeredBy`, `summary` | Why this version exists and what it proposes |
| `priorities[]` | `rank`, `serviceIdentifier`, `serviceName`, `score`, `businessImpact`, `capacityUnits`, `decision` (`recover-now` \| `postpone` \| `waiting-for-dependency` \| `already-healthy`), `reason`, `blockedBy[]` |
| `capacity` | `resourceIdentifier`, `totalCapacity` (reported), `assumedCapacity` (what the plan really counts on), `plannedUnits`, `remainingUnits`, `postponedUnits`, `confirmed` |
| `assumptions[]` | Sentences explaining knowledge from previous runs applied to this plan, for example that the reported capacity was overstated before |
| `steps[]` | See PlanStep |
| `changesFromPrevious[]` | `kind` (`capacity-changed` \| `step-postponed` \| `step-added` \| `step-removed` \| `priority-changed` \| `step-reprioritized`), `description`, `serviceIdentifier`, `stepIdentifier` |

**PlanStep**

| Field | Content |
|---|---|
| `identifier` | Stable across versions: `stp_contact-engineer`, `stp_<service>_task`, `stp_<service>_execute`, `stp_<service>_verify`, `stp_support-communication` |
| `order`, `title`, `reason` | Presentation |
| `invocation` | `{ name: ToolName, input }` the agent will execute |
| `owner` | `{ kind: "agent" \| "engineer" \| "operator", name }` |
| `serviceIdentifier`, `capacityUnits`, `requiresApproval`, `dependsOn[]` | Constraints |
| `status` | `proposed` \| `awaiting-approval` \| `approved` \| `rejected` \| `running` \| `completed` \| `failed` \| `cancelled` \| `postponed` |
| `statusReason`, `resultSummary`, `attempts`, `toolCallIdentifier`, `approvalIdentifier`, `updatedAt` | Traceability |

The UI must distinguish proposed (`proposed`, `awaiting-approval`, `approved`), in progress (`running`) and completed (`completed`) steps, plus `postponed`, `failed` and `rejected`.

---

## Approvals (`/approvals`)

### `GET /approvals?runIdentifier=&status=`

Optional `status`: `pending` \| `approved` \| `rejected` \| `superseded` \| `expired`.

### `GET /approvals/:identifier`

**ApprovalRecord**: `identifier`, `runIdentifier`, `planIdentifier`, `planVersion`, `planStepIdentifier`, `toolCallIdentifier`, `decisionIdentifier`, `serviceIdentifier`, `actionSummary`, `reason`, `consequences[]`, `capacityUnits`, `status`, `requestedAt`, `expiresAt`, `decidedAt`, `decidedBy`, `comment`, `invalidationReason`.

### `POST /approvals/:identifier/decision`

```json
{ "decision": "approve", "operatorName": "Luis", "comment": "Go ahead" }
```

`decision`: `approve` \| `reject`. Rules:

- Only a `pending` approval can be decided; otherwise `409 Invalid State Transition`.
- The approval must belong to the active plan version. If the plan changed it is marked `superseded` and the call answers `409`; the agent will already have requested a new one.
- `approve`: the step becomes `approved` and runs in the next cycle.
- `reject`: the step becomes `rejected`, the agent revises the plan and postpones the service with the operator comment. The decision is respected in later versions.
- No decision before `AGENT_APPROVAL_TIMEOUT_MILLISECONDS`: `expired`, and the agent requests it again.

Events: `approval.decided`, then `plan-step.updated`, and `plan.revised` when applicable.

---

## Tasks (`/tasks`)

### `GET /tasks?runIdentifier=&status=`

Optional `status`: `open` \| `in-progress` \| `done` \| `cancelled`.

**TaskRecord**: `identifier`, `title`, `description`, `assignee { name, role }`, `priority` (`critical` \| `high` \| `medium` \| `low`), `status`, `statusNote`, `serviceIdentifier`, `createdBy { kind, name }`, `planIdentifier`, `planStepIdentifier`, `toolCallIdentifier`, `createdAt`, `updatedAt`.

### `PATCH /tasks/:identifier/status`

```json
{ "status": "done", "note": "Failover prepared", "updatedBy": "Marta Ruiz" }
```

Event: `task.updated`.

---

## Activity (`/activity`)

### `GET /activity?runIdentifier=&types=&afterSequence=&limit=&offset=`

| Parameter | Description |
|---|---|
| `types` | Comma separated list of event types |
| `afterSequence` | Only events with a greater `sequence`. Use it to page live without losing events |
| `limit` | 1 to 500, default 100 |
| `offset` | Default 0 |

Response `{ items: ActivityRecord[], total, limit, offset }` ordered by ascending `sequence`.

### `GET /activity/stream?runIdentifier=&types=&afterSequence=&limit=&apiKey=`

Server-sent events (`text/event-stream`). First replays up to `limit` events after `afterSequence` for the run (active run when omitted), then pushes every new event live. Each message has `event: <type>`, `id: <sequence>` and `data: <ActivityRecord>`. Reconnect with the last `id` as `afterSequence` to resume without gaps.

```js
const source = new EventSource(`${base}/activity/stream?apiKey=${apiKey}&afterSequence=0`)
source.addEventListener("plan.revised", (message) => render(JSON.parse(message.data)))
source.onmessage = (message) => append(JSON.parse(message.data))
```

**ActivityRecord**

| Field | Content |
|---|---|
| `identifier`, `runIdentifier`, `incidentIdentifier`, `sequence`, `occurredAt` | Order and ownership |
| `type` | See the event catalog |
| `source` | `harness` \| `agent` \| `operator` \| `tool` \| `integration` \| `system` \| `replay` |
| `title`, `summary` | Ready-to-display text |
| `payload` | Full related object (plan, approval, task, call, verification…) |
| `correlation` | `harnessEventIdentifier`, `decisionIdentifier`, `planIdentifier`, `planVersion`, `planStepIdentifier`, `toolCallIdentifier`, `approvalIdentifier`, `taskIdentifier`, `engineerCallIdentifier`, `recoveryActionIdentifier`, `serviceIdentifier` (only those that apply) |
| `simulated` | `true` when the data or the action is simulated |
| `replayed`, `replayOfEventIdentifier` | `true` in replays, with the original event |

---

## Tools (`/tools`)

### `GET /tools`

The eight tools with `name`, `description`, `interaction` (`harness` \| `simulated-data` \| `real-call` \| `real-record` \| `operator-interaction` \| `test-environment`), `asynchronous` and `simulated` for this deployment.

### `GET /tools/calls?runIdentifier=`, `GET /tools/calls/:identifier`

**ToolCallRecord**: `identifier`, `name`, `interaction`, `input`, `status` (`pending` \| `running` \| `succeeded` \| `failed` \| `cancelled`), `output` (union by `kind`: `incident-state`, `service-health`, `recovery-capacity`, `engineer-call`, `task`, `approval`, `recovery-execution`, `recovery-verification`), `error { code, message, retryable }`, `externalReference`, `simulated`, `attempt`, `idempotencyKey`, `planIdentifier`, `planVersion`, `planStepIdentifier`, `decisionIdentifier`, `startedAt`, `finishedAt`.

Error codes: `TIMEOUT`, `CALL_FAILED`, `APPROVAL_INVALID`, `CAPACITY_INSUFFICIENT`, `EXECUTION_FAILED`, `UNEXPECTED_ERROR`, `CANCELLED`.

---

## Engineer calls (`/engineers/calls`)

### `GET /engineers/calls?runIdentifier=`, `GET /engineers/calls/:identifier`

**EngineerCallRecord**: `identifier`, `engineer { name, phone, role }`, `purpose`, `questions[] { key, question }`, `mode` (`simulated` \| `live`), `status` (`dialing` \| `in-progress` \| `completed` \| `failed` \| `no-answer`), `providerReference`, `result { outcome, summary, transcript, answers[] { key, question, answer } }`, `failureReason`, `startedAt`, `finishedAt`, `toolCallIdentifier`, `planStepIdentifier`.

---

### Voice provider results

Outbound records also carry `provider` (`elevenlabs` or `happyrobot`), `providerCallSid`, and `incidentContext { location, incidentDescription, servicesDown }`. For ElevenLabs, `providerReference` is the conversation ID and `providerCallSid` is Twilio's call SID. Legacy records may not have the new optional fields.

`result.authorizations` contains `notifyAllClients` and `trafficFailoverAuthorized`, each with `{ value: boolean | null, rationale: string }`. These are voice evidence and never automatically change plan-specific approvals or incident capacity facts. They are also retained in the completed tool output. Missing extraction remains unknown. See [provider configuration and rehearsal](ELEVENLABS.md).

## Recovery (`/recovery/actions`)

### `GET /recovery/actions?runIdentifier=`

**RecoveryActionRecord**: `identifier`, `serviceIdentifier`, `actionKind` (`failover-database` \| `redeploy-service` \| `restart-stream` \| `scale-service`), `actionDescription`, `capacityUnits`, `resourceIdentifier`, `approvalIdentifier`, `mode` (`simulated` \| `http`), `status` (`requested` \| `running` \| `succeeded` \| `partial` \| `failed`), `providerReference`, `result { outcome, detail }`, `startedAt`, `finishedAt`.

Capacity is reserved in the harness before executing; when it is insufficient the tool fails with `CAPACITY_INSUFFICIENT` and nothing runs. When the action fails, the capacity is released.

---

## Replays (`/replays`)

### `POST /replays`

```json
{ "sourceRunIdentifier": "run_…", "speedFactor": 4 }
```

Creates a new run with `runKind: "replay"`, deactivates the current one and re-emits the recorded events keeping their timing (divided by `speedFactor`, at most 5 s between events). Every event is emitted with `replayed: true` and title `[Replay] …`. The agent executes nothing during replays. `409` when a replay is already running.

### `GET /replays/status`

`{ status: "idle" | "running" | "finished" | "cancelled", runIdentifier, sourceRunIdentifier, totalEvents, emittedEvents, speedFactor, startedAt, finishedAt }`.

---

## Learning (`/learning`)

The agent learns across runs of the same scenario family (both languages share the knowledge).

### `GET /learning/insights?scenarioIdentifier=`

`LearningInsightRecord[]`: `identifier`, `scenarioIdentifier` (the family), `kind` (`capacity-overstated` \| `recovery-outcome`), `subject` (resource or service), `observations`, `lastRunIdentifier`, `data`, `summary`, `updatedAt`.

- `capacity-overstated`: recorded when a `capacity-limited` event confirms less capacity than the dashboard reported. The next plan built while the capacity is unconfirmed uses the lowest confirmed value and explains it in `assumptions`.
- `recovery-outcome`: count of `success`, `partial` and `failure` outcomes per service, shown in the report as lessons.

### `DELETE /learning/insights`

Forgets everything. Returns `{ removed }`. Use it before a demo that should start with no prior knowledge.

### `GET /learning/reports/current`, `GET /learning/reports/:runIdentifier`

Post-incident **RunReport**:

| Field | Content |
|---|---|
| `runIdentifier`, `scenarioIdentifier`, `status`, `startedAt`, `impactedAt`, `resolvedAt` | Run identity and lifecycle |
| `durations` | `impactToFirstPlanMilliseconds`, `impactToFirstApprovalRequestMilliseconds`, `approvalWaitMilliseconds`, `impactToFirstRecoveryMilliseconds`, `impactToResolutionMilliseconds` (null when not reached) |
| `planVersions[]` | `version`, `triggeredBy`, `summary`, `createdAt`, `changeCount`, `assumptions` |
| `approvals[]` | `identifier`, `actionSummary`, `status`, `decidedBy`, `waitMilliseconds` |
| `services` | `recovered[]`, `degraded[]`, `down[]` service names |
| `toolCalls` | `total`, `succeeded`, `failed`, `simulated` |
| `eventCount`, `timeline[]` | Key events (`occurredAt`, `type`, `title`, `summary`, `simulated`) |
| `lessons[]` | Insight summaries for the scenario family |

---

## Outbound webhooks (`/webhooks`)

### `POST /webhooks/subscriptions`

```json
{
  "name": "Incident observer",
  "description": "Downstream activity consumer",
  "targetURL": "https://consumer.example.test/casa-pepe/events",
  "secret": "at-least-sixteen-characters",
  "eventTypes": ["plan.created", "plan.revised", "approval.requested"]
}
```

Empty or omitted `eventTypes` receives everything. Creating a subscription for a `targetURL` that already has an active one updates that subscription (name, secret, event types) instead of adding a duplicate. Response: `WebhookSubscriptionRecord` (`identifier`, `name`, `description`, `targetURL`, `eventTypes`, `active`, `createdAt`, `updatedAt`). The secret is never returned.

### `GET /webhooks/subscriptions`, `GET /webhooks/subscriptions/:identifier`

### `DELETE /webhooks/subscriptions/:identifier`

`204`. Pending deliveries are abandoned.

### `POST /webhooks/subscriptions/:identifier/ping`

Sends a test delivery with `eventType: "webhook.ping"` and returns the `WebhookDeliveryRecord`.

### `GET /webhooks/deliveries?subscriptionIdentifier=&status=&limit=`

`status`: `pending` \| `delivered` \| `failed` \| `exhausted`. **WebhookDeliveryRecord**: `identifier`, `subscriptionIdentifier`, `eventIdentifier`, `eventType`, `runIdentifier`, `status`, `attempts`, `nextAttemptAt`, `lastAttemptAt`, `lastStatusCode`, `lastError`, `createdAt`, `deliveredAt`.

### Delivery format

`POST` to `targetURL` with:

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `x-casa-pepe-event` | Event type |
| `x-casa-pepe-delivery` | Delivery identifier (deduplicate retries with it) |
| `x-casa-pepe-timestamp` | ISO 8601 of the send |
| `x-casa-pepe-signature` | `sha256=<hex>` |

Body:

```json
{ "deliveryIdentifier": "whd_…", "subscriptionIdentifier": "whs_…", "attempt": 1, "sentAt": "…", "eventType": "plan.revised", "event": { "…ActivityRecord" } }
```

Signature verification (Node):

```js
const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`
timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
```

The receiver must answer 2xx. On any other response or timeout (`WEBHOOK_TIMEOUT_MILLISECONDS`) the delivery is retried with exponential backoff (2 s, 4 s, 8 s… up to 60 s) until `WEBHOOK_MAXIMUM_ATTEMPTS`; then it becomes `exhausted`.

---

## Inbound webhooks (public with secret)

### `POST /webhooks/happyrobot`

Header `x-happyrobot-signature: <HAPPYROBOT_WEBHOOK_SECRET>`.

```json
{
  "callIdentifier": "call_…",
  "outcome": "completed",
  "summary": "Snapshot is twelve minutes old…",
  "transcript": "…",
  "answers": [
    { "key": "database-snapshot", "answer": "About twelve minutes", "confirmed": true },
    { "key": "backup-capacity", "answer": "I am not sure, let me check", "confirmed": false }
  ]
}
```

`outcome`: `completed` \| `failed` \| `no-answer`. The `key` values must match the questions sent when the call was triggered. `confirmed` is optional: when the HappyRobot extraction node provides it, it decides whether the fact becomes `confirmed` or stays `pending`; when absent, the answer text is interpreted (doubt keywords keep the fact pending). Response `202 { "accepted": true }`. The agent records the facts and continues the plan.

#### What the service sends to HappyRobot

In `HAPPYROBOT_MODE=live`, starting the call does `POST HAPPYROBOT_TRIGGER_URL` with `Authorization: Bearer <HAPPYROBOT_API_KEY>` and this body:

```json
{
  "call_identifier": "call_…",
  "incident_id": "inc_…",
  "engineer_name": "Marta Ruiz",
  "engineer_phone": "+34600000000",
  "severity": "high",
  "incident_summary": "Confirm the state of the backup region…",
  "affected_services": "Casa Pepe platform",
  "ask_about": "1. [database-snapshot] How old is the latest orders database snapshot…?\n2. [route-assignment-readiness] Is the route assignment service ready…?\n3. [backup-capacity] Can we count on the twelve compute units…?",
  "callback_url": "<PUBLIC_BASE_URL>/api/webhooks/happyrobot"
}
```

The field names match the parameters of the HappyRobot "Predefined request" trigger of the `Casa Pepe — contact_engineer` workflow. `severity` and `affected_services` are fixed values because the call record does not carry them. `ask_about` lists the questions with their `key` in brackets so the extraction node can return one answer per key. The workflow must end with a webhook node that posts the result above to `callback_url` with the `x-happyrobot-signature` header and echoes `call_identifier` as `callIdentifier`.

#### Timing and fallback

- A call may take up to `AGENT_CALL_TIMEOUT_MILLISECONDS` (default 5 minutes) before it is marked as timed out; other tools use `AGENT_TOOL_TIMEOUT_MILLISECONDS`.
- A timed out, failed or unanswered call is retried once (`AGENT_MAXIMUM_STEP_ATTEMPTS`). If it fails again, the agent revises the plan: recovery steps stop depending on the call, the plan states in `assumptions` that it continues with unconfirmed facts, and a critical task is assigned to confirm those facts by another channel. Approvals are still required exactly as before.

### `POST /webhooks/recovery`

Header `x-recovery-signature: <RECOVERY_WEBHOOK_SECRET>`.

```json
{ "actionIdentifier": "rec_…", "status": "succeeded", "detail": "Replica promoted" }
```

`status`: `succeeded` \| `partial` \| `failed`. Response `202`. Updates the service state in the harness, completes the tool call and triggers the verification.

---

## Activity event catalog

| Type | Source | When |
|---|---|---|
| `incident.run-started` | harness | New run |
| `incident.impact-detected` | harness | Meteorite applied |
| `incident.event-applied` | harness | Any harness event |
| `incident.status-changed` | system | `detected` → `responding` → `partially-recovered` → `recovered` |
| `incident.run-reset` | harness | Reset |
| `simulation.advanced` | harness | Simulation clock advanced manually or automatically |
| `service.health-changed` | harness / integration | Service health change |
| `resource.capacity-changed` | harness | Total or allocated capacity changes |
| `fact.recorded` | agent | Fact confirmed or left pending after the call |
| `plan.created`, `plan.revised` | agent | New plan version (payload: full plan) |
| `plan-step.updated` | agent | Step status change |
| `decision.recorded` | agent | Explanation of priorities and changes |
| `tool-call.started`, `tool-call.completed`, `tool-call.failed` | tool | Tool execution |
| `approval.requested`, `approval.decided`, `approval.superseded`, `approval.expired` | agent / operator | Approval lifecycle |
| `task.assigned`, `task.updated` | agent / operator | Tasks |
| `engineer-call.started`, `engineer-call.completed`, `engineer-call.failed` | tool / integration | Outbound voice call through the configured provider |
| `recovery.executed`, `recovery.verified` | integration / tool | Action and verification in the test environment |
| `agent.cycle-finished` | agent | Summary: recovered, pending and next step |
| `agent.limit-reached` | agent | Cycle limit reached |
| `replay.started`, `replay.finished` | replay | Reproduction |
| `webhook.ping` | system | Test deliveries only |

## Internal flow in short

```
POST /demo/impact
  → harness applies the impact → internal event → AgentService.requestCycle
  → plan v1 → contact_engineer (asynchronous) + assign_task ×N
  → call finishes (simulated timer or POST /webhooks/happyrobot) → facts → request_approval (database)
POST /demo/twist
  → capacity 7 → plan v2, approval v1 superseded, new approval v2
POST /approvals/:id/decision approve
  → execute_recovery (reserves capacity) → result (timer or POST /webhooks/recovery) → verify_recovery
  → route-assignment runs without approval → verification → degraded services heal on their own
  → agent.cycle-finished: recovered / pending / next step
```

Every activity event is persisted, delivered through webhooks to the subscriptions, and queryable at `GET /activity` with its correlation identifiers. The Next.js dashboard reads the same activity through `GET /activity/stream` via its server-side proxy; it does not register an outbound webhook subscription.

## MVP communications and incoming calls

See [MVP tools rehearsal](../../../demo/MVP-TOOLS.md) for configuration, payloads and the complete sequence.

| Method and route | Authorization | Behavior |
|---|---|---|
| `POST /webhooks/happyrobot/incoming` | HappyRobot shared-secret header | Record an untrusted incoming capacity report; deduplicate by run/provider call ID. |
| `POST /engineers/incoming-calls/simulate` | Operator API key | Same flow, labelled simulated; disabled when HappyRobot is live. |
| `GET /engineers/incoming-calls` | Operator API key | Reports for the active run, including confirmation state. |
| `POST /engineers/incoming-calls/:identifier/confirm` | Operator API key | Confirm numeric capacity and trigger a revised plan. |
| `GET /status` | Public | Readable service-status page with a manual refresh link. |
| `GET /status/public` | Public | Explicitly published, customer-safe JSON service status for the active run; no credentials, call details or internal plan data. |

`GET /tools` now includes the eight MVP names plus the legacy tools. Email destinations are server configuration, never agent input. The email tool records provider acceptance separately from inbox delivery; simulated emails send nothing. HTTP `verify_recovery` submits a test delivery for `route-assignment`; other services use health queries scoped to the run.
