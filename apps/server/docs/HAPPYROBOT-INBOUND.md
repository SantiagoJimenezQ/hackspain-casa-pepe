# HappyRobot inbound company requests

Set `CASA_PEPE_INBOUND_WEBHOOK_SECRET` on the backend and use the same value as the workflow HTTP nodes' `x-casa-pepe-webhook-secret` header. Keep the value in secret configuration. It is not the HappyRobot trigger API key.

The backend must have exactly one active unresolved non-replay run, or set `HAPPYROBOT_INBOUND_RUN_IDENTIFIER` to the desired run before starting the call. Existing calls stay bound to their original run.

## 1. Bind at call start

`POST /api/webhooks/happyrobot/initiation`, JSON body:

```json
{"conversationId":"happyrobot:<actual-provider-run-id>"}
```

A `200` response contains `{"sessionReference":"<opaque-reference>"}`. Preserve it for this conversation. Retrying the same provider identifier returns the same reference while its run remains eligible. Do not fabricate a new identifier on HTTP retry.

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
| 404 | Unknown session reference |
| 409 | No eligible run, ambiguous run selection, stale binding, or conflicting retry |

Unknown or ambiguous company names are accepted as `needs-clarification`, not silently mapped to another company. No incoming capacity fields are accepted as capacity evidence.

## 3. Verify the result

`GET /api/call-outcomes?runIdentifier=<run>` requires the normal `Authorization: API <API_KEY>` operator header. Confirm the outcome appears once, check its company resolution, and inspect the run's activity and resulting plan. Capacity must stay unchanged by receipt. A stored receipt and an actual plan change are different checks.

The pending reassessment survives restart. Its interval requires a running backend; request-only hosting may delay processing while suspended. For a reliable phone demo, keep the coordinator running and verify its resulting plan independently. Deployment and publishing the HappyRobot inbound workflow are required before calling the configured number.
