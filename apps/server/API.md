# Casa Pepe API integration guide — v0.2

This API simulates AWS infrastructure and recovery outcomes for the Casa Pepe demo. The UI observes state and offers operator controls; an external agent chooses companies and destinations and invokes migration actions. The harness never generates a recovery plan, changes business priorities, or calls AWS/HappyRobot.

## 1. Start here

Requires Node.js 22+. From the repository root:

```sh
npm run dev:server
# In a second terminal:
curl http://127.0.0.1:4000/api/status
npm run demo:api
```

`demo:api` **resets the running demo** and runs the guarded request example in [demo-client.mjs](demo-client.mjs). It starts one migration, steps the clock, and prints progress or failure. It does not implement an agent policy.

| Setting | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4000` | API listen port |
| `UI_ORIGIN` | `http://localhost:3000` | Exact origin allowed by browser CORS |
| `API_BASE_URL` | `http://127.0.0.1:4000` | Used by the example client only |

The server binds to `127.0.0.1`. Each server process owns one shared in-memory run; all clients see and mutate that run. Restarting the process discards everything and returns to manual mode. There is no authentication, persistence, subscription endpoint, external side effect, or production deployment in this implementation. `simulated: true` must be visible in the UI.

### Integration artifacts

- [OpenAPI 3.1 JSON](../../packages/contracts/openapi.json), also served by `GET /api/openapi.json`: import into API tooling or a client generator.
- [StatusSnapshot types](../../packages/contracts/status.d.ts), [dashboard types](../../packages/contracts/dashboard.d.ts), [simulation command types](../../packages/contracts/simulation.d.ts).
- [Healthy fixture](../../packages/contracts/status.example.json), [manual incident fixture](../../packages/contracts/status.incident.example.json), [randomized incident fixture](../../packages/contracts/status.randomized.example.json).
- [Runnable fetch client](demo-client.mjs). No package installation required.

After changing schemas, run `npm run docs:generate`. The generator is the maintained source for the OpenAPI document. Type declarations describe payloads; they do not validate responses at runtime.

## 2. Transport and response conventions

Send JSON objects with `Content-Type: application/json`. Empty request bodies are treated as `{}`. Arrays, null, malformed JSON and bodies over **8192 bytes** are rejected. Unknown object fields are ignored. Query parameters are ignored. Paths must match exactly (no trailing slash).

Every successful POST returns HTTP **200** with the **entire `StatusSnapshot`**, including idempotent no-ops. No response envelope wraps it. GET `/api/status` returns the same shape. Responses include `Cache-Control: no-store`. `OPTIONS` returns 204 with CORS headers; allowed methods are GET, POST and OPTIONS. `/health` returns `{ "status": "ok" }` independently of simulated infrastructure health.

Errors have a stable code and a human-readable message. Do not branch on message text:

```json
{ "error": { "code": "INVALID_REQUEST", "message": "Destination has no available capacity" } }
```

| HTTP | Code | Client behavior |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Fix malformed input or reassess the domain precondition; includes unknown IDs, insufficient capacity and invalid state transitions |
| 409 | `STALE_STATE` | Fetch current state and reconsider the action before resubmitting |
| 404 | `NOT_FOUND` | Unknown endpoint or unsupported method (this API does not return 405) |
| 413 | `BODY_TOO_LARGE` | Reduce request size |

Rejected commands do not change state or consume random values. This statement excludes independent clock ticks if the automatic clock is running. Network errors/timeouts have an **unknown outcome**: the server may have applied the command. Re-read state before retrying a migration, reset, or advance. There is no idempotency-key store.

## 3. Run lifecycle and safe concurrency

A run starts healthy with no incident and a paused clock. `start` creates the primary outage. Recovery can proceed while the incident remains active. Fully recovering the companies does not close the incident. `stop` explicitly resolves it, restores all region/service health, cancels running migrations and pauses time. Completed company placements, capacities, events, elapsed time and the random streams remain in that run. Starting again creates another incident in the same run; **use reset for an independent trial**.

`reset` replaces the entire run, clears incident/migrations/history, restores original company placements, applies new scenario config, initializes random streams and pauses time. It creates a new `runId`. Omitted config fields use defaults; they do not retain the previous configuration.

Every POST accepts these optional concurrency guards:

```json
{ "expectedRunId": "<runId from the latest snapshot>", "expectedRevision": 17 }
```

A mismatch returns 409 before mutation. Include `expectedRunId` on agent actions so a late decision cannot affect a new demo. Also include `expectedRevision` when a decision relies on an exact snapshot. Each appended event increases `revision`; one command can append several events. A paused no-op does not necessarily increase it.

For the UI, serialize commands and avoid overlapping poll requests. Cancel or ignore in-flight reads when issuing a command, then adopt the command response. Within the same run, ignore snapshots with a lower revision. UUID run IDs have no ordering: do not assume a different UUID is newer; refetch when run identity is uncertain. Start polling again after the command finishes. For deterministic replay, keep the automatic clock paused and use explicit `advance` calls.

## 4. Configure the environment

`POST /api/simulation/reset` — allowed at any time.

```json
{
  "mode": "randomized",
  "seed": 42,
  "difficulty": "medium",
  "automaticEvents": true,
  "maxConcurrentDisruptions": 2
}
```

| Field | Default | Accepted values / effect |
| --- | --- | --- |
| `mode` | `manual` | `manual` preserves the original fixture; `randomized` enables sampled capacity and migration outcomes |
| `seed` | `42` | Integer 0–4294967295; same config and ordered actions/ticks reproduce outcomes |
| `difficulty` | `medium` | `easy`, `medium`, `hard`; controls spare capacity, duration and failure probabilities |
| `automaticEvents` | `true` | Enables the secondary infrastructure fault; **does not** start the clock or disable migration failures when false |
| `maxConcurrentDisruptions` | `2` | Integer 1–3; counts unhealthy regions, including the primary; 1 suppresses a secondary fault while the primary is down |

Manual mode accepts/stores this config but does not draw random values or permit clock controls. To preserve old integrations, `reset {}` and process startup remain manual.

### What is random, precisely?

| Rule | Easy | Medium | Hard |
| --- | --- | --- | --- |
| Spare slots sampled per backup (uniform integer) | 0–3 | 0–2 | 0–1 |
| Migration duration (uniform integer simulated minutes) | 8–12 | 12–20 | 18–28 |
| Base transfer failure chance per active migration per minute | 0.2% | 0.8% | 1.5% |
| Secondary fault chance per eligible minute | 15% | 30% | 50% |

Existing resident companies always fit, and London receives at least one spare slot. Each started migration samples its duration once. Its per-minute failure probability is `base × (1 + 2 × destinationUtilization)`, where utilization includes resident companies and active inbound reservations divided by capacity. Full destinations therefore have three times the base rate. Failed transfers record a timeout reason and utilization.

At most **one generated secondary fault per run** occurs. A minute is eligible only while a migration is running, automatic events are enabled, and the unhealthy-region count is below the cap. A healthy backup is selected uniformly, then becomes degraded or unavailable with equal probability. It may be a migration destination or an unrelated backup; there is no forced target or forced recovery plan. A fault is possible, not guaranteed.

Each tick first tries the secondary fault, then processes still-running migrations in creation order, then records the clock advance. A newly unhealthy destination immediately fails inbound migrations. Otherwise each migration draws its transfer outcome and advances on success. Availability only changes on successful completion at 100%. There is no automatic repair, automatic migration selection, demand spike, random initial outage region or telemetry delay in this version.

Initial capacity, secondary faults and recovery outcomes use independent PRNG streams. Polling never draws randomness. Invalid commands do not draw randomness. Reproduction assumes the same implementation version, scenario configuration, ordered accepted commands and ticks. IDs and wall-clock timestamps differ between runs; compare outcomes and `simulationMinute`, not byte-identical JSON. Different agent actions can change eligibility/load and therefore the trajectory.

## 5. Clock and incident controls

| POST endpoint | Body (plus optional guards) | Preconditions and effect |
| --- | --- | --- |
| `/api/incident/start` | `{}` | No-op if active; otherwise create incident and mark primary region/services unavailable. Does not resume time. |
| `/api/incident/stop` | `{}` | No-op if absent/resolved; otherwise resolve, restore region/service health, cancel running migrations and pause time. |
| `/api/simulation/pause` | `{}` | Active randomized incident required. Idempotently pause automatic ticks. |
| `/api/simulation/resume` | `{}` | Active randomized incident required. Idempotently enable automatic ticks. |
| `/api/simulation/advance` | `{"minutes":1}` | Active randomized incident required. Integer 1–60, default 1. Process that many simulated minutes synchronously, even while paused. |

When resumed, the server advances **one simulated minute per timer callback**, scheduled approximately once per real second. This is an accelerated demo clock, not a wall-clock guarantee. The next callback can occur soon after resume, and delayed callbacks do not catch up. A manual `advance` while resumed adds to automatic ticks; pause first for exact pacing.

Pause freezes only automatic time. Manual migrations, health injections, stop, and reset remain available. Stop/reset prevent subsequent timer callbacks from progressing the old state. An in-flight old client command must supply guards to be rejected after reset.

## 6. Recovery actions and manual event injection

All controls below require an active incident, except the legacy service-capacity endpoint. Health values are `healthy`, `degraded`, `unavailable`.

### Start a migration

`POST /api/migrations/start`

```json
{ "companyId": "alphatech", "targetRegionId": "eu-west-2" }
```

Company/destination must exist. Destination must differ from the current region, be healthy and have a free slot. Each company can have at most one running migration. Starting reserves one destination slot immediately; it does not free the source slot. Returns the new migration in `migrations`; find the running entry by `companyId` (or use that company's `migrationId`).

In randomized mode duration is sampled and progression/failure occurs on ticks. In manual mode duration is 20 minutes and only explicit progress updates advance it. Agent integrations should call this endpoint and observe outcomes; they should not use the demo progress/restore overrides to claim recovery success.

### Override migration progress or inject failure

`POST /api/migrations/update` accepts exactly one of:

```json
{ "migrationId": "<id>", "progress": 45 }
```

```json
{ "migrationId": "<id>", "failureReason": "Connection timed out" }
```

Migration must be running. Progress is an integer from current progress to 100; backwards updates fail. Failure reason must contain non-whitespace text, maximum 500 characters. A progress update adjusts the remaining ETA; 100 sets status to succeeded, moves company placement, frees the source slot, and converts the destination reservation to residency. Failure sets a terminal state and releases its reservation, leaving the company at its source. A retry is a new start request and creates a new ID. Terminal migrations cannot be updated.

### Inject region health or capacity

`POST /api/simulation/region`

```json
{ "regionId": "eu-west-2", "status": "unavailable" }
```

```json
{ "regionId": "us-east-1", "capacity": 2 }
```

Supply status, capacity or both. Capacity must be an integer between the current allocated slots and 100; validation uses allocation **before** applying health changes. To model loss of committed resources, inject an outage. Degraded/unavailable destinations fail running inbound migrations, release their reservations, and affect resident company health. Restoring region health does not resurrect failed migrations. Manual faults bypass the generated-fault cap and do not consume its one-fault budget.

### Restore one company immediately

`POST /api/simulation/company/restore` with `{"companyId":"alphatech"}`.

Demo-only override: if healthy, no-op; if a migration is running, reject; otherwise choose the first healthy non-primary backup with room in fixture order, then record a start and immediate completion. Reject if none has space. This deterministic convenience operation consumes a slot and skips random duration/failure. The agent should choose its own destination via migration start.

### Legacy service controls

- `POST /api/simulation/service` with `{"serviceId":"route-assignment","status":"healthy"}` changes primary service health. Requires active incident. It does not restore primary region health.
- `POST /api/simulation/capacity` with `{"capacity":1}` sets legacy service recovery capacity (integer 0–2), including outside an incident. It does not affect company migrations or random capacity sampling.

**Capacity units are deliberately explicit:** `regions[].capacity` is company hosting slots (one per company regardless of user count); `backup.capacity` is the older independent service recovery fixture. New migration integrations must use region slots. `allocated` includes residents plus running inbound migrations; unavailable regions report `available: 0` without deleting residents.

## 7. Read the snapshot correctly

| Field | UI/agent use |
| --- | --- |
| `simulated` | Display a simulation badge |
| `runId`, `revision`, `updatedAt` | Run identity, event-based version, wall-clock time of last recorded change |
| `simulation` | Config, paused state, elapsed simulated minutes and generated-fault count |
| `incident` | Null before start; active/resolved plus timestamps and ID |
| `region`, `status`, `services`, `backup` | Legacy primary-service view; **not** global company status |
| `regions` | Map coordinates, health and hosting slots |
| `companies` | Name, user count, home/current placement, derived health, latest migration ID, static business priority/reason |
| `migrations` | All attempts in this run, including terminal attempts; progress, duration, ETA and reason |
| `summary` | Totals calculated from company health and migration history |
| `agent` | Simulation activity indicator, not an actual agent's reasoning or execution trace |
| `events` | Complete append-only event list for this run; reset starts a new list |

Primary-hosted company health depends on its region **and** primary services. Other companies depend on their current region. Migration progress alone never improves company health before completion. Static priority numbers are ascending (1 is most important); an agent is free to reprioritize based on changing evidence.

`affectedUsers` sums users at degraded or unavailable companies. `online`, `degraded`, `offline` count companies, not regions or services. `companiesOnlinePercent` is the rounded healthy-company fraction. Migration counts include every attempt in the run. `progressPercent` averages progress of each company's latest attempt, including failed/cancelled attempts; it is **not a recovery percentage**. `durationMinutes` is sampled nominal work duration (20 for manual/instant overrides); `etaMinutes` is simulated remaining work, null in terminal states.

The fixture has 6 companies and 8,480 users. Starting the initial outage affects Alphatech, Globex and Initech: 5,460 users. Values are internally consistent rather than copying inconsistent totals from the visual reference.

### Stable fixture IDs

| Company ID | Users | Initial region |
| --- | ---: | --- |
| `alphatech` | 2340 | `eu-west-1` |
| `globex` | 1890 | `eu-west-1` |
| `initech` | 1230 | `eu-west-1` |
| `umbrella` | 980 | `us-east-1` |
| `soylent` | 1120 | `ap-southeast-1` |
| `stark-industries` | 920 | `sa-east-1` |

Regions: `eu-west-1` (primary/Ireland), `eu-west-2` (London), `us-east-1` (Virginia), `ap-southeast-1` (Singapore), `sa-east-1` (São Paulo). Coordinates are illustrative city locations, not AWS facility locations. Service IDs: `route-assignment`, `package-tracking`.

### Event format and catalog

Each event contains `id`, `runId`, `revision`, `occurredAt` (UTC ISO timestamp), `simulationMinute`, `source: "simulation"`, `type`, and `detail` (string or scalar-valued object). Deduplicate by event ID. IDs inside detail correlate migration events with their attempts. All events remain available through polling; there is no pagination or retention limit yet.

| Type | Meaning / detail |
| --- | --- |
| `simulation.reset` | New run initialized; read snapshot config |
| `incident.started`, `incident.resolved` | Operator incident lifecycle change; resolution also cancels remaining migrations |
| `simulation.paused`, `simulation.resumed` | Automatic clock state changed |
| `simulation.advanced` | One minute processed; `elapsedMinutes` |
| `simulation.disruption` | Seeded fault: `regionId`, `status`, `reason`; followed by region/failure events |
| `region.changed` | `regionId`, `status`, `capacity` after mutation |
| `migration.started` | `migrationId`, `companyId`, `targetRegionId` |
| `migration.duration_sampled` | `migrationId`, `durationMinutes` in randomized mode |
| `migration.running` | Progress update: `migrationId`, `progress`, `reason` |
| `migration.succeeded` | Completed placement: `migrationId`, `progress`, `reason` |
| `migration.failed` | Transfer failure: ID/progress/reason, or destination failure: ID/reason |
| `service.health_changed` | `serviceId`, `status` |
| `backup.capacity_changed` | Legacy `capacity` |

Stop cancellation is represented by the resolution event plus cancelled migration statuses, not a separate per-migration event. Wall timestamps describe when the server processed something; simulation minutes describe scenario time. Repeated polls do not alter either.

## 8. Copyable workflow

```sh
# Configure a reproducible randomized run (initially paused).
curl -sS -X POST http://127.0.0.1:4000/api/simulation/reset \
  -H 'Content-Type: application/json' \
  -d '{"mode":"randomized","seed":42,"difficulty":"medium","automaticEvents":true,"maxConcurrentDisruptions":2}'

curl -sS -X POST http://127.0.0.1:4000/api/incident/start -d '{}'

# London is guaranteed at least one initial spare slot.
curl -sS -X POST http://127.0.0.1:4000/api/migrations/start \
  -H 'Content-Type: application/json' \
  -d '{"companyId":"alphatech","targetRegionId":"eu-west-2"}'

# Each call advances time; inspect state and adapt instead of assuming success.
curl -sS -X POST http://127.0.0.1:4000/api/simulation/advance \
  -H 'Content-Type: application/json' -d '{"minutes":3}'

# Alternatively, resume the clock for a live demo, then pause to inspect.
curl -sS -X POST http://127.0.0.1:4000/api/simulation/resume -d '{}'
curl -sS -X POST http://127.0.0.1:4000/api/simulation/pause -d '{}'
curl -sS http://127.0.0.1:4000/api/status
```

These short curl examples omit concurrency guards for readability. The runnable client includes them. In an agent loop: read snapshot → choose an action using current constraints → submit guarded action → observe migration/events → reassess if conditions change. Keep polling read-only. Use manual stepping for tests, automatic ticks for live demonstrations, and reset with the same seed to investigate an outcome.

## 9. Verification and boundaries

`npm test` covers existing manual flows, migration capacity/failure, seeded replay, variation across seeds, read isolation, invalid-command atomicity, fault caps, pause/resume/stop/reset, HTTP controls and documentation contract checks. Randomness belongs only to the simulated environment. Real agent planning, approvals, engineer calls, real recovery verification, persistent replay and production security remain separate integrations.
