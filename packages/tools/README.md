# MVP tools and adapters

The agent's eight MVP tools are registered in `apps/server/src/tools`. Shared integration payloads live in `packages/contracts/tools.d.ts`. This package provides server-only, dependency-free HTTP/email adapters; NestJS owns persistence, authorization, orchestration and callbacks.

| Tool | Behavior |
|---|---|
| `get_incident_context` | Read the incident and latest plan, including services, dependencies, capacity and business impact. |
| `call_engineer` | Simulate an asynchronous engineer call; live voice is disabled. |
| `save_recovery_plan` | Check the previous version, supersede pending approvals and persist the new plan. |
| `send_incident_email` | Render the persisted plan and send it to the configured operator via Resend, or simulate it. |
| `request_approval` | Ask the operator to authorize a specific plan step. |
| `execute_recovery` | Check active plan, service requirements, dependencies, capacity and matching approval before executing. |
| `verify_recovery` | Independently check recovery; HTTP route-assignment verification submits a test delivery. |
| `publish_status_update` | Publish a customer-safe service snapshot at `/api/status` (JSON: `/api/status/public`), marking simulation and unverified recovery explicitly. |
| `read_incoming_emails` | List inbound emails through Resend and optionally fetch one message by provider email ID. |

Legacy tools (`get_incident_state`, `get_service_health`, `get_recovery_capacity`, `contact_engineer`, `assign_task`) remain available for existing plans and integrations. They are not additional MVP deliverables.

## Voice availability

Calls are simulated only, including standalone call tests. Legacy credentials cannot enable live voice, pending historical tests are not polled externally, and provider webhooks reject requests. Use the authenticated simulation endpoint below for incoming reports; provider contract descriptions are retained for reference.

## Incoming calls

`POST /api/webhooks/happyrobot/incoming` receives a call report, authenticated with the existing HappyRobot webhook secret. A provider call ID plus run ID deduplicates retries. The report is persisted as **pending**, and the agent pauses further work until an authenticated operator confirms capacity through `POST /api/engineers/incoming-calls/:identifier/confirm`. Confirmation triggers replanning after it is persisted. Caller-supplied names are claims, not authentication.

The authenticated `/api/engineers/incoming-calls/simulate` endpoint provides the same flow in simulated HappyRobot mode. Reset/replay runs reject reports and confirmations. See the [demo walkthrough](../../demo/MVP-TOOLS.md).

## Email adapter

`sendIncidentEmail` uses the [Resend email API](https://resend.com/docs/api-reference/emails/send-email). Its stable run/plan/channel idempotency key is reused for retries. The result means provider acceptance, not confirmed inbox delivery. Provider response bodies and credentials are never included in error messages. Network calls have bounded timeouts and reject redirects.

`INCIDENT_EMAIL_MODE=simulated` never contacts a provider. Live sending requires server-side `RESEND_API_KEY`, `INCIDENT_EMAIL_FROM` and `INCIDENT_EMAIL_TO`. The agent cannot choose arbitrary recipients. The generated email is explicitly labelled as a demo.

The authenticated `/api/tools/tests` routes expose the same email and engineer-call boundaries for provider checks that do not depend on an incident. They default to synthetic simulated requests, persist idempotent results, and keep provider results and HappyRobot callbacks isolated from incident records and agent events. Standalone calls use the same configured adapter as incident calls; GET returns the persisted result of a HappyRobot test.

### Resend inbound email

Set `RESEND_WEBHOOK_SECRET` to the signing secret from Resend, configure the Resend webhook for `email.received` to target `/api/webhooks/resend/incoming`, and ensure the deployment preserves the raw request body. The endpoint verifies the Svix signature, rejects stale or malformed requests, deduplicates provider email IDs and associates accepted events with the active run when one exists. The `read_incoming_emails` tool uses the server-side Resend API key to list received email summaries and fetch the selected email's full payload; provider credentials stay out of browser code.

## Operational boundary

This is a single coordinator hackathon runtime. It uses the existing database-backed tool log and per-run cycle serialization. It does not provide distributed scheduling or exactly-once side effects across crashes; email also relies on the provider's idempotency retention window. Unknown outcomes must be reconciled before retrying after that window. No voice workflow or subscription is required for simulated calls.

## Outbound voice providers

NestJS owns the `EngineerCallAdapter` boundary, persisted call records and completion handling. HappyRobot completes calls through its authenticated callback. See [voice setup](../../apps/server/docs/HAPPYROBOT.md) and the [shared outbound contract](../contracts/outbound-calls.d.ts).

For agent integration, see the [call_engineer input, outcome, and next-action contract](../../apps/server/docs/CALL-ENGINEER-CONTRACT.md).
