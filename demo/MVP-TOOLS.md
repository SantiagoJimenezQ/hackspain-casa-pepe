# MVP tools rehearsal

This implementation adds the eight agreed agent tools and an inbound phone-report flow to the NestJS runtime. No external calls or emails are sent by the setup or automated tests. The operations dashboard now consumes the same API through its server-side proxy; the endpoints below remain useful for a backend-only rehearsal.

## Configure

1. Install workspace dependencies with `pnpm install` from the root.
2. Follow `apps/server/README.md` to configure the ignored local environment, a Postgres/Supabase connection, and start the API.
3. Keep `HAPPYROBOT_MODE=simulated`, `INCIDENT_EMAIL_MODE=simulated`, and `RECOVERY_MODE=simulated` for a deterministic rehearsal.
4. For real email, set `INCIDENT_EMAIL_MODE=live`, a Resend sending key, a verified `INCIDENT_EMAIL_FROM`, and the intended operator's `INCIDENT_EMAIL_TO` in the ignored local environment. The API reports provider acceptance, not inbox delivery.
5. For real phone calls, configure the existing HappyRobot outbound workflow and credentials. Provision an inbound number/workflow in HappyRobot to collect the run identifier, caller name, summary and structured numeric capacity. Have it POST the payload below using `x-happyrobot-signature` with the configured shared secret. The provider workflow must map its fields to this contract; this is not a claim that HappyRobot's native webhook payload matches it automatically. Never treat caller ID or a transcript as operator authorization.

## Rehearse

All routes except the public status feed and provider callbacks use the existing `Authorization: API <API_KEY>` header. Use your secret manager or ignored local environment; do not paste real credentials into documentation.

1. `POST /api/demo/start`, then `POST /api/demo/impact`. Read the returned/current run ID. The agent observes the incident, saves plan v1, emails the operator (simulated by default), and calls the engineer.
2. Review `GET /api/tools/calls`, `GET /api/engineers/calls`, and `GET /api/plans/current` for actual outcomes and mode labels.
3. Call the configured inbound number. In simulation, POST this body to `/api/engineers/incoming-calls/simulate`; the live workflow uses `/api/webhooks/happyrobot/incoming` instead:

```json
{
  "providerCallIdentifier": "demo-incoming-001",
  "runIdentifier": "<current-run-id>",
  "callerName": "Demo engineer",
  "summary": "The backup region only has seven usable compute units.",
  "reportedCapacity": 7
}
```

4. Read `GET /api/engineers/incoming-calls`. The report is pending and further agent work pauses. Confirm the report using its returned identifier:

`POST /api/engineers/incoming-calls/<identifier>/confirm`

```json
{ "operatorName": "Demo operator", "confirmedCapacity": 7 }
```

5. The agent saves a revised plan, supersedes obsolete pending approvals and sends the revised email. The database and route assignment get the seven units; tracking and events wait.
6. Read `GET /api/approvals?status=pending`, then approve the **current** database action through the existing `/api/approvals/<identifier>/decision` endpoint. Recovery only executes when its plan, service, dependencies and approval match.
7. Read `GET /api/recovery/actions` and `GET /api/tools/calls`. Route verification must return a valid route for a test delivery in HTTP mode.
8. Open `/api/status` in a second browser tab to see the public status page. Use its refresh link after publication; `/api/status/public` exposes the same snapshot as JSON. It contains only service names/statuses, timestamps, and demo/simulation labels. Status is published after verification steps finish; actions that merely report success are not advertised as verified recovery.
9. Reset and repeat. Old run callbacks are rejected. Duplicate inbound webhook deliveries do not create another report or change confirmed capacity. For the operator UI, follow [apps/web/README.md](../apps/web/README.md) and use the Demo drawer instead of subscribing the browser to outbound webhooks.

## Real local recovery target

`demo/recovery-environment/server.mjs` is an authenticated, in-memory demo delivery application. Its services start down per run. Recovery enables database/dispatch functionality, and the delivery endpoint assigns a concrete route. This demonstrates a real HTTP side effect, not provisioning AWS infrastructure.

Provide the same nonempty `RECOVERY_ENVIRONMENT_API_KEY` to both processes through your environment. Start the target:

```sh
node demo/recovery-environment/server.mjs
```

Configure the API with `RECOVERY_MODE=http` and `RECOVERY_ENVIRONMENT_URL=http://127.0.0.1:4100`. The target binds only to loopback, keeps at most 100 runs, and loses its state on restart. Use the manual meteorite scenario for this target: resource requirements match that scenario. Randomized scenarios can change requirements and should use simulated recovery.

The target supports:

- `POST /recovery/actions`: activate a supported service, idempotent by run/action ID.
- `GET /recovery/services/:service/health?runIdentifier=...`: independent health read.
- `POST /deliveries`: requires a recovered route-assignment service and returns `{runIdentifier, deliveryIdentifier, routeIdentifier, status:"assigned"}`.

Run its integration test with `node --test demo/recovery-environment/server.test.mjs`. It uses an ephemeral loopback port and an ephemeral credential, sends no email, and places no calls.

## Remaining live validation

Rehearse provider credentials, sender verification, phone number/workflow mapping, public callback reachability, real incoming/outgoing calls, operator inbox receipt, and the deployed dashboard before presenting. Unit and local HTTP tests do not prove any of those external integrations.
