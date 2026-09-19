# MVP tools and adapters

The agent's eight MVP tools are registered in `apps/server/src/tools`. Shared integration payloads live in `packages/contracts/tools.d.ts`. This package provides server-only, dependency-free HTTP/email adapters; NestJS owns persistence, authorization, orchestration and callbacks.

| Tool | Behavior |
|---|---|
| `get_incident_context` | Read the incident and latest plan, including services, dependencies, capacity and business impact. |
| `call_engineer` | Start an asynchronous call through the configured ElevenLabs or HappyRobot adapter, or simulate it. |
| `save_recovery_plan` | Check the previous version, supersede pending approvals and persist the new plan. |
| `send_incident_email` | Render the persisted plan and send it to the configured operator via Resend, or simulate it. |
| `request_approval` | Ask the operator to authorize a specific plan step. |
| `execute_recovery` | Check active plan, service requirements, dependencies, capacity and matching approval before executing. |
| `verify_recovery` | Independently check recovery; HTTP route-assignment verification submits a test delivery. |
| `publish_status_update` | Publish a customer-safe service snapshot at `/api/status` (JSON: `/api/status/public`), marking simulation and unverified recovery explicitly. |

Legacy tools (`get_incident_state`, `get_service_health`, `get_recovery_capacity`, `contact_engineer`, `assign_task`) remain available for existing plans and integrations. They are not additional MVP deliverables.

## Incoming calls

`POST /api/webhooks/happyrobot/incoming` receives a call report, authenticated with the existing HappyRobot webhook secret. A provider call ID plus run ID deduplicates retries. The report is persisted as **pending**, and the agent pauses further work until an authenticated operator confirms capacity through `POST /api/engineers/incoming-calls/:identifier/confirm`. Confirmation triggers replanning after it is persisted. Caller-supplied names are claims, not authentication.

The authenticated `/api/engineers/incoming-calls/simulate` endpoint provides the same flow in simulated HappyRobot mode. Reset/replay runs reject reports and confirmations. See the [demo walkthrough](../../demo/MVP-TOOLS.md).

## Email adapter

`sendIncidentEmail` uses the [Resend email API](https://resend.com/docs/api-reference/emails/send-email). Its stable run/plan/channel idempotency key is reused for retries. The result means provider acceptance, not confirmed inbox delivery. Provider response bodies and credentials are never included in error messages. Network calls have bounded timeouts and reject redirects.

`INCIDENT_EMAIL_MODE=simulated` never contacts a provider. Live sending requires server-side `RESEND_API_KEY`, `INCIDENT_EMAIL_FROM` and `INCIDENT_EMAIL_TO`. The agent cannot choose arbitrary recipients. The generated email is explicitly labelled as a demo.

## Operational boundary

This is a single coordinator hackathon runtime. It uses the existing database-backed tool log and per-run cycle serialization. It does not provide distributed scheduling or exactly-once side effects across crashes; email also relies on the provider's idempotency retention window. Unknown outcomes must be reconciled before retrying after that window. Deployments must configure the HappyRobot workflow and a reachable callback URL; adding these tools does not provision phone numbers or provider accounts.

## Outbound voice providers

NestJS owns the `EngineerCallAdapter` boundary, persisted call records and completion handling. ElevenLabs uses server-side polling; HappyRobot uses its callback. See [voice setup](../../apps/server/docs/ELEVENLABS.md) and the [shared outbound contract](../contracts/outbound-calls.d.ts).
