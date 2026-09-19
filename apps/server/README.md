# API and execution process

Owner: harness and backend track, in coordination with the agent and integrations track.

Backend of **Casa Pepe**, the AI incident coordinator for HackSpain. It implements the `apps/server/` process described in the [root README](../../README.md) and the use case in [MASTER.md](../../MASTER.md): a meteorite takes down the `eu-west-1` region of a delivery company and the agent decides what to recover first with the backup capacity available, coordinates people, asks the operator for approval, executes the recovery and verifies it.

Built with NestJS and TypeScript, persisted in **Supabase (Postgres)** through TypeORM. The Next.js dashboard reads the authenticated API and proxied SSE activity stream; other consumers can subscribe through signed outbound webhooks.

## Scope

- Expose the incident state and live updates to the UI.
- Receive demo controls and operator decisions.
- Run the agent cycle and process tool results.
- Receive asynchronous answers from integrations such as HappyRobot.
- Keep the relation between run, event, decision, tool call and approval.
- Handle timeouts, cancellation and errors.

Shared consumer contracts live in `packages/contracts/`. Server-internal types in `src/*/types` may be richer, but the declarations in that package are the reference for UI and integration consumers.

## Getting started

From `apps/server/`:

```bash
pnpm install
cp .env.example .env.local          # set API_KEY and SUPABASE_DATABASE_URL (see below)
pnpm develop                        # http://localhost:3000/api, OpenAPI at /documentation
```

Other commands: `pnpm build`, `pnpm start`, `pnpm test`, `pnpm lint`, `pnpm format`, `pnpm typecheck`.

The repository root is a pnpm workspace (`pnpm-workspace.yaml`), so `pnpm install` can also run from the root. If `pnpm exec` hangs, run the binaries directly (`./node_modules/.bin/nest start`, `./node_modules/.bin/jest`); see the note about `allowBuilds` in the workspace file.

With the default configuration the engineer call and the recovery run in **simulated** mode. The LLM still requires provider credentials. Tests inject scripted model responses explicitly; see [LLM setup and runtime](docs/LLM-AGENT.md).

### Supabase

The service persists in Postgres. Point it at the team Supabase project in `.env.local`:

```bash
SUPABASE_DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

The connection string is in Supabase under *Project settings > Database > Connection string (URI)*. Use the session pooler on port 5432; the transaction pooler (6543) does not support the prepared statements TypeORM uses, and the direct connection is IPv6 only on the free plan. Tables are created automatically on startup (`synchronize`), which is enough for the hackathon; a stable deployment should move to migrations. TLS is enabled automatically for Supabase hosts (and for any URL with `sslmode=require`); any other Postgres, such as a local install, connects without TLS.

Every environment variable is documented in [.env.example](.env.example). Set `DATABASE_QUERY_LOGGING=true` to print every SQL statement when diagnosing latency; against the Supabase pooler each round trip costs about 120 ms, so the service writes with single-statement inserts and updates and keeps webhook subscriptions cached.

## Authentication

Every route except `/api/health` and the inbound webhooks requires the header `Authorization: API <API_KEY>`, with the value of `API_KEY` from `.env.local`. The frontend and the demo controls share this single key.

## Scenarios

The same scenario ships in two languages. `GET /scenarios` lists them; pass the identifier to `POST /demo/start`.

| Identifier | Language |
|---|---|
| `meteorite-eu-west-1` (default) | English |
| `meteorite-eu-west-1-es` | Spanish |

Everything the operator reads follows the scenario language: service names, impact descriptions, engineer questions and answers, plan summaries, priority reasons, step titles, decision explanations and cycle summaries. Technical event titles and log messages stay in English.

## Demo walkthrough

```bash
BASE=http://localhost:3000/api; AUTH="Authorization: API casa-pepe-local-api-key"
curl -X POST $BASE/demo/start  -H "$AUTH" -H "Content-Type: application/json" -d '{"scenarioIdentifier":"meteorite-eu-west-1-es"}'   # 1. everything healthy (Spanish scenario)
curl -X POST $BASE/demo/impact -H "$AUTH"      # 2. meteorite: the agent creates plan v1 and calls the engineer
curl -X POST $BASE/demo/twist  -H "$AUTH"      # 5. backup capacity is insufficient: plan v2, approvals invalidated
curl $BASE/approvals?status=pending -H "$AUTH"
curl -X POST $BASE/approvals/<identifier>/decision -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"decision":"approve","operatorName":"Operator","comment":"Go ahead"}'   # 7. approval
curl $BASE/overview -H "$AUTH"                 # 9. what recovered and what is still pending
curl $BASE/learning/reports/current -H "$AUTH" # post-incident report: durations, plan versions, approvals, lessons
curl -X POST $BASE/demo/reset  -H "$AUTH"      # new run; late results from the previous one are ignored
```

With 12 reported units the initial plan recovers the four failing services. After the twist (7 confirmed units) the agent recovers the orders database and route assignment, postpones package tracking and the events stream, explains why, and assigns a task to customer support to communicate the delay. A randomized run can be started with `mode`, `seed`, `difficulty`, `automaticEvents` and `maxConcurrentDisruptions`; use `/demo/advance` for deterministic stepping or `/demo/resume` for a live clock.

## Endpoints

| Group | Routes | Description |
|---|---|---|
| Demo | `POST /demo/start`, `/demo/impact`, `/demo/twist`, `/demo/events`, `/demo/reset`, `/demo/pause`, `/demo/resume`, `/demo/advance` | Harness controls, separate from the operator controls |
| Incident | `GET /incidents/current`, `/incidents/runs`, `/incidents/runs/:run` | State, services, dependencies, capacity and facts |
| Overview | `GET /overview` | Full initial state for the UI in one call |
| Plans | `GET /plans/current`, `/plans`, `/plans/:identifier` | Plan versions with priorities, steps, owners and changes |
| Approvals | `GET /approvals`, `POST /approvals/:identifier/decision` | Proposed action, consequences and operator decision |
| Tasks | `GET /tasks`, `PATCH /tasks/:identifier/status` | Tasks with owner and status |
| Activity | `GET /activity?afterSequence=&types=` | Full log, correlated across event, decision, tool call and approval |
| Tools | `GET /tools`, `/tools/calls`, `/tools/calls/:identifier` | Available agent tools, which ones are simulated, and every execution |
| Standalone tool tests | `GET/POST /tools/tests`, `GET /tools/tests/:identifier`, `POST /tools/tests/callbacks/happyrobot` | Authenticated synthetic email/call checks with durable polling; callback uses the HappyRobot shared secret and never touches an incident |
| Calls | `GET /engineers/calls` | Engineer calls with questions and answers |
| Recovery | `GET /recovery/actions` | Actions executed in the test environment |
| Agent | `GET /agent/status`, `POST /agent/cycle` | Agent status and on-demand cycle |
| Replays | `POST /replays`, `GET /replays/status` | Reproduce a previous run, flagged as replay |
| Scenarios | `GET /scenarios`, `/scenarios/:identifier` | Available scenarios and their language |
| Learning | `GET /learning/insights`, `DELETE /learning/insights`, `GET /learning/reports/:run` | What the agent learned from previous runs and the post-incident report |
| Stream | `GET /activity/stream?apiKey=` | Server-sent events for browsers, with backlog replay from `afterSequence` |
| Webhooks | `POST/GET/DELETE /webhooks/subscriptions`, `POST /webhooks/subscriptions/:identifier/ping`, `GET /webhooks/deliveries` | Subscriptions and delivery log |
| Inbound | `POST /webhooks/happyrobot`, `POST /webhooks/recovery`, `POST /webhooks/resend/incoming` | Asynchronous results from HappyRobot, the test environment and Resend inbound email events |
| Health | `GET /health` | Postgres and integration modes |

The full reference of every endpoint, body, response and the event catalog is in [docs/API.md](docs/API.md). Interactive OpenAPI documentation is served at `/documentation`.

For provider-independent checks of outbound email and engineer calls, use the standalone tool-test routes. `POST /tools/tests` defaults to simulated mode and accepts fixed synthetic content; live calls use `ENGINEER_CALL_PROVIDER` and remain `accepted` until an ElevenLabs conversation lookup or HappyRobot callback completes them. Poll the result endpoint to fetch ElevenLabs completion; no public callback is needed for ElevenLabs. The copyable requests and polling examples are in [docs/API-CURL-TEST-GUIDE.md](docs/API-CURL-TEST-GUIDE.md#optional-standalone-tool-checks).

For repeatable API testing with an environment-provided API key, use the [curl test guide](docs/API-CURL-TEST-GUIDE.md). It includes an ordered incident walkthrough, asynchronous polling, approval checks, and optional endpoint exercises.

The simulation configuration and state are shared in [`packages/contracts/simulation.d.ts`](../../packages/contracts/simulation.d.ts). The incident snapshot contract is [`packages/contracts/incident.d.ts`](../../packages/contracts/incident.d.ts). These files describe the consumer-facing payload; NestJS DTOs remain the runtime validators.

## Outbound webhooks

Every activity event is delivered to active outbound webhook subscriptions. The dashboard does not need a webhook subscription: it reads the authenticated overview and uses the SSE endpoint below through its own Next.js server route.

- `POST` request with body `{ deliveryIdentifier, subscriptionIdentifier, attempt, sentAt, eventType, event }`, where `event` is the full activity record.
- Headers `x-casa-pepe-event`, `x-casa-pepe-delivery`, `x-casa-pepe-timestamp` and `x-casa-pepe-signature`.
- Signature: `sha256=HMAC_SHA256(secret, "<timestamp>.<body>")`. Verify with a constant-time comparison.
- Retries with exponential backoff up to `WEBHOOK_MAXIMUM_ATTEMPTS`; the delivery log is at `GET /webhooks/deliveries`.
- Subscribing again with the same `targetURL` updates the existing subscription instead of duplicating deliveries.
- `eventTypes` filters the subscription; empty receives everything. Types live in `src/activity/constants/activity.constant.ts`.

Every event carries `simulated` (simulated data or action) and `replayed` (reproduction), as the interface requires.

### Browser stream

The dashboard receives the same events through its server-side proxy at `GET /api/casa-pepe/activity/stream`. The proxy adds the backend API key before opening `GET /api/activity/stream`, so the key never reaches the browser. The backend stream first replays the backlog after `afterSequence` and then pushes new events live; each message carries the event `type` and `id` equal to the sequence, so a reconnect can resume.

## Inbound webhooks

| Route | Header | Body |
|---|---|---|
| `POST /webhooks/happyrobot` | `x-happyrobot-signature: <HAPPYROBOT_WEBHOOK_SECRET>` | `{ callIdentifier, outcome: "completed"\|"failed"\|"no-answer", summary, transcript, answers: [{ key, answer, confirmed? }] }` |
| `POST /webhooks/recovery` | `x-recovery-signature: <RECOVERY_WEBHOOK_SECRET>` | `{ actionIdentifier, status: "succeeded"\|"partial"\|"failed", detail }` |
| `POST /webhooks/resend/incoming` | Svix `svix-id`, `svix-timestamp`, `svix-signature` headers | Resend `email.received` event; the raw request body is verified before persistence |

When triggering the call, the service sends `HAPPYROBOT_TRIGGER_URL` the `call_identifier`, the engineer details, the questions with their `key` and the `callback_url`. The HappyRobot flow must return those same `key` values in `answers`. In `http` mode the recovery does `POST {RECOVERY_ENVIRONMENT_URL}/recovery/actions` and verifies with `GET {RECOVERY_ENVIRONMENT_URL}/recovery/services/:service/health`.

A result that arrives after a reset is rejected with `409 Stale Run` and does not alter the new run. A phone call may take up to `AGENT_CALL_TIMEOUT_MILLISECONDS` (five minutes by default); if the engineer cannot be reached after the allowed attempts, the agent continues with the unconfirmed facts, says so in the plan, and assigns a task to confirm them by another channel. See [docs/API.md](docs/API.md) for the exact payloads exchanged with HappyRobot.

Resend inbound requests are accepted only with a valid, recent Svix signature. Duplicate provider email IDs are ignored, and accepted events are associated with the active run when one exists. Set `RESEND_WEBHOOK_SECRET` to the signing secret shown by Resend and configure the webhook target as `/api/webhooks/resend/incoming`.

## How the agent decides

The LLM selects what to investigate, proposes validated plans, chooses individual actions and revises its decisions when new evidence arrives mid-execution. Each turn includes current state and durable evidence. The runtime enforces capacity, dependencies, approvals and stale-state guards. Provider failures or exhausted turn budgets pause autonomous decisions visibly.

See [LLM setup, execution semantics and demo acceptance](docs/LLM-AGENT.md).

## Structure

```
src/
  common/          typed configuration, error filter, helpers, Postgres connection
  authentication/  API key guard
  health/          terminus
  scenarios/       meteorite scenario definition
  incidents/       harness: incident state, runs, demo controls
  activity/        activity log and source of the webhooks
  plans/           plan versions and diff between versions
  approvals/       approvals bound to a plan version
  tasks/           tasks with owner
  engineers/       contact_engineer: simulated, ElevenLabs and HappyRobot adapters
  recovery/        execute_recovery and verify_recovery: simulated and HTTP adapters
  tools/           registry and execution of the eight tools
  agent/           decision cycle, plan builder, bilingual messages, overview for the UI
  learning/        insights across runs and post-incident reports
  webhooks/        subscriptions, signed deliveries and inbound webhooks
  replays/         reproduction of previous runs
```

## MVP tools

The runtime now also exposes the agreed MVP names, operator email (simulated or Resend), incoming phone reports with operator confirmation, and a public status page and JSON feed. Existing tool names remain compatible. See [MVP tools rehearsal](../../demo/MVP-TOOLS.md) for live integration setup, the local HTTP recovery target and the complete demo sequence.

## ElevenLabs outbound calls

See [outbound voice setup](docs/ELEVENLABS.md) for the existing emergency agent, dynamic variables, post-call authorization evidence, and switching to HappyRobot.
