# HappyRobot inbound company requests

Set `CASA_PEPE_INBOUND_WEBHOOK_SECRET` on the backend and use the same value as the workflow HTTP nodes' `x-casa-pepe-webhook-secret` header. Keep the value in secret configuration. It is not the HappyRobot trigger API key.

The incident header shows a six-digit call code and the inbound number (configured by `HAPPYROBOT_INBOUND_PHONE_NUMBER`, currently +12603688621). Callers can read the code digit by digit, for example “uno, dos, tres, cuatro, cinco, seis”. Existing incidents receive codes during schema synchronization; new runs receive their own unique codes. A reset never reuses a code. Codes are identifiers, not passwords or approvals.

## 1. Ask for the code, then bind

The voice agent greets the caller and asks for the six-digit incident code before collecting the priority request. Its `vincular_incidente` tool calls `POST /api/webhooks/happyrobot/initiation`:

```json
{"conversationId":"happyrobot:<actual-provider-run-id>","incidentIdentifier":"123456"}
```

A `200` response contains `sessionReference`, canonical `incidentIdentifier`, `runIdentifier` and `callCode`. Only a successful binding lets the agent proceed. The endpoint also accepts the full incident/run ID, or the code formatted as `123 456` / `123-456`. Unknown codes return 404: ask the caller to check and retry. Inactive/replay incidents and changing a successfully bound call to another incident return 409.

The submission tool repeats initiation with the same provider conversation and the validated code to retrieve the same session reference. This keeps the reference inside the workflow, not the voice model. Do not fabricate a conversation identifier on retry.

## 2. Submit the caller's request

`POST /api/webhooks/happyrobot/call-outcomes`, JSON body:

```json
{
  "schemaVersion": 1,
  "sessionReference": "<reference-from-initiation>",
  "outcome": {
    "kind": "priority-request",
    "customerName": "Happy Robot",
    "requestedPriority": "first",
    "reason": "Necesitamos recuperar el servicio de pedidos cuanto antes."
  }
}
```

A `202` response contains `accepted: true`, a stable `outcomeIdentifier` and `status: "received"`. The agent may say the request was received for assessment; it must not claim priority was granted. One outcome is allowed per conversation. Exact retries are safe; changed content is rejected.

| Status | Meaning |
|---|---|
| 400 | Invalid schema, empty company, unsupported outcome or priority |
| 401 | Missing/wrong dedicated secret, or backend secret not configured |
| 404 | Unknown incident code/ID or session reference |
| 409 | Inactive/replay incident, ambiguous identifier, changed incident, stale binding, or conflicting retry |

Unknown or ambiguous company names are accepted as `needs-clarification`, not silently mapped to another company. No incoming capacity fields are accepted as capacity evidence.

## 3. Verify the result

`GET /api/call-outcomes?runIdentifier=<run>` requires both `Authorization: API <API_KEY>` and the owning `X-Casa-Pepe-Session` header; the dashboard supplies these through its server proxy. Confirm the outcome appears once, check its company resolution, and inspect the run's activity and resulting plan. Capacity must stay unchanged by receipt. A stored receipt and an actual plan change are different checks.

The pending reassessment survives restart. Its interval requires a running backend; request-only hosting may delay processing while suspended. For a reliable phone demo, keep the coordinator running and verify its resulting plan independently. Deployment and publishing the HappyRobot inbound workflow are required before calling the configured number.

The updated provider draft asks for the code first and remains unpublished until this endpoint contract is deployed. Its two tools are `vincular_incidente` and `registrar_prioridad_empresa`.

## Browser-session isolation and schema upgrade

Browser sessions own incidents. The call code selects the existing run without a browser cookie; the provider still needs the dedicated secret and no priority request grants approval. The outcome list requires the owning browser session, and coordinator learning is scoped using the persisted run owner.

All three schema migrations and entity synchronization share `BROWSER_SESSION_SCHEMA_UPGRADE`. Back up the database, stop older backend processes, and start one updated backend with this flag set to `true`. Verify the upgrade, then set it back to `false` and restart; deploy the matching frontend. Never enable this flag in previews connected to shared Supabase. If the browser-session migration already ran, it is not repeated; new HappyRobot migrations run on the next explicit upgrade. Historical sessions remain legacy and historical call bindings are not reassigned to a new browser.
