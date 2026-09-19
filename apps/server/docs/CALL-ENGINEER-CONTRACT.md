# `call_engineer`: input, outcome, and next actions

This is the agent-facing contract for the current ElevenLabs emergency agent.
`contact_engineer` is the legacy alias. Calls are asynchronous and collect voice
authorizations; they do not send notifications or execute recovery.

## 1. What the incident agent submits

`call_engineer` is a **plan-step invocation**, not a native LLM function or a
standalone HTTP endpoint. Include this invocation in a complete `propose_plan`
draft, then call `execute_step` with the persisted runnable step identifier.
Replace the example recipient with the trusted configured engineer from context;
all three identity fields must match exactly.

```json
{
  "name": "call_engineer",
  "input": {
    "engineerName": "Configured on-call engineer",
    "engineerPhone": "+34600000000",
    "engineerRole": "Configured on-call role",
    "purpose": "Request permission to notify affected clients and divert traffic to backup.",
    "questions": [
      {
        "key": "traffic-failover-authorized",
        "question": "Do you authorize diverting production traffic to the backup region?"
      }
    ]
  }
}
```

| Input field | Type | Meaning |
| --- | --- | --- |
| `engineerName` | nonempty string | Trusted configured contact name. |
| `engineerPhone` | nonempty string | Trusted configured destination in E.164 format. |
| `engineerRole` | nonempty string | Trusted configured role. |
| `purpose` | nonempty string | Why this plan needs a call; not a replacement for the hosted voice prompt. |
| `questions` | array of `{key, question}` | Required, nonempty. Live ElevenLabs still needs at least one stable keyed permission question such as `traffic-failover-authorized`; the hosted agent asks its own combined permission prompt and does not return technical answers. Simulated and HappyRobot providers use keyed technical questions from the scenario briefing. |

No extra input keys are accepted. Do not put credentials, `outage_time`, location,
incident IDs, provider IDs, or invented contact details in this object. The server
supplies trusted execution context and the incident snapshot.

The hosted ElevenLabs agent asks one combined question: “¿Autoriza avisar a todos
los clientes y desviar el tráfico al respaldo?” It does **not** receive the
`questions` array or collect answers about backup capacity, snapshot age or
service readiness. Do not schedule it expecting those technical facts to be
confirmed.

After the plan is accepted, the native LLM function arguments are:

```json
{"stepIdentifier": "<persisted runnable call step identifier>"}
```

Use that object with `execute_step`, not with `call_engineer`. While a call is
running, do independent work or call `wait_for_input` with a concrete reason.
Do not execute the same step again or schedule another call merely to poll.

## 2. What the server sends to ElevenLabs

`POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call`

Headers: `xi-api-key: <server secret>` and `Content-Type: application/json`.

```json
{
  "agent_id": "<configured emergency agent ID>",
  "agent_phone_number_id": "<configured outbound line ID>",
  "to_number": "+34600000000",
  "conversation_initiation_client_data": {
    "dynamic_variables": {
      "contact_name": "Configured on-call engineer",
      "location": "Dubái, me-central-1",
      "outage_time": "14:30 UTC",
      "incident_description": "The delivery platform is unavailable. Orders and deliveries are blocked.",
      "services_down": "Orders database, route assignment, package tracking"
    }
  }
}
```

- `outage_time` comes from persisted `incident.impactedAt`, passed as optional
  `incidentContext.outageStartedAt` and formatted `HH:mm UTC`. Missing, invalid,
  or timezone-less values become `""`; never substitute the call start time.
- `location` is retained for compatibility, but the hosted prompt must not speak
  region, city, country or region codes. It speaks the supplied outage time.
- The incident description comes from the run (scenario fallback), capped at two
  sentences. `services_down` joins the names of currently non-healthy services.
- Voice, prompt, and extraction schemas belong to the hosted agent. Credentials
  and provider IDs are server configuration, not model-selected arguments.

An accepted start response looks like this:

```json
{
  "success": true,
  "message": "Success",
  "conversation_id": "conv_example",
  "callSid": "CA_example"
}
```

This means **accepted**, not answered or authorized. The server records
`conversation_id` as `providerReference` and `callSid` as `providerCallSid`.
Conversation results are retrieved with authenticated
`GET /v1/convai/conversations/<conversation_id>`; incident calls use server
polling, while standalone tool tests refresh on GET. No ElevenLabs public
callback is needed.

## 3. What the incident agent receives

At the tool implementation boundary, initial acceptance returns:

```json
{"status": "in-progress", "externalReference": "call_example"}
```

`externalReference` here is the **internal engineer-call ID**, not the ElevenLabs
conversation ID. The persisted tool-call record has `status: "running"`,
`output: null`, and `error: null`. The agent runtime wraps plan-step execution
separately; do not confuse this internal result with the native `execute_step`
response or the standalone `/api/tools/tests` response.

After successful call completion, the persisted tool-call record contains these
fields (other audit fields are omitted in this example):

```json
{
  "status": "succeeded",
  "output": {
    "kind": "engineer-call",
    "engineerCallIdentifier": "call_example",
    "mode": "live",
    "summary": "The recipient explicitly authorized notifying clients and diverting traffic.",
    "answers": [],
    "authorizations": {
      "notifyAllClients": {
        "value": true,
        "rationale": "The recipient answered yes to the complete combined question."
      },
      "trafficFailoverAuthorized": {
        "value": true,
        "rationale": "The recipient explicitly accepted both actions."
      }
    }
  },
  "error": null
}
```

`output` is the same object returned in a synchronous implementation result
`{status: "succeeded", output: ...}`. Asynchronous completion persists it and
notifies the incident loop, which receives fresh call/tool evidence.

The current ElevenLabs adapter always returns `answers: []`. Each authorization
has a `value: true | false | null` and a string `rationale` (possibly empty).
The `authorizations` property is optional in the provider-neutral contract;
missing authorization evidence is unknown, not approved. The raw provider fields
map as follows:

| ElevenLabs analysis field | Casa Pepe output field |
| --- | --- |
| `data_collection_results.notify_all_clients` | `authorizations.notifyAllClients` |
| `data_collection_results.traffic_failover_authorized` | `authorizations.trafficFailoverAuthorized` |
| `transcript_summary` | `summary` |

Only literal booleans are accepted. Text such as `"true"`, absent values and
malformed entries map to `null`. `call_successful: "success"`, `status: "done"`,
HTTP 200, and the summary are never substitutes for explicit authorization.
The full transcript and provider IDs are retained on the engineer-call record,
not duplicated in this compact tool output. Inspect authenticated
`GET /api/engineers/calls` and `GET /api/tools/calls/:identifier` for audit details;
the latter takes the **tool-call ID**, not the engineer-call ID.

## 4. How to choose the next action

Evaluate the two permissions independently against current incident state:

| Result | Meaning | Next action |
| --- | --- | --- |
| `true` | Explicit permission for that action. | Consider the corresponding next plan step, with its normal controls. |
| `false` | Explicit refusal of that action. | Do not perform that action; revise the plan and explain the refusal. |
| `null` or absent | No usable permission obtained. | Keep that action pending; seek operator clarification or assign follow-up. |
| Call pending/running | No final outcome yet. | Wait for the completion event or work on independent steps. |
| Call failed/cancelled | No successful authorization result. | Inspect the failure and existing provider call before any deliberate retry. |
| `mode: "simulated"` | Test evidence only. | Do not treat it as a real person's permission. |

Examples: `(true, false)` permits notification but denies failover;
`(null, true)` leaves notification unresolved and records failover permission;
`(true, true)` records both permissions but executes neither action.

A failover permission does **not** replace the operator approval tied to a
specific recovery plan. Recheck capacity, dependencies, current plan and required
approval before `execute_recovery`; follow it with `verify_recovery` before
reporting success. Voice permissions do not confirm technical readiness.

A notification permission does **not** mean customers were notified.
`send_incident_email` emails the configured operator with persisted plan content,
not all customers. `publish_status_update` publishes status, not bulk delivery.
Use an available, correctly scoped integration or assign an owned notification
task; do not claim all-client delivery using either tool's receipt.

## 5. Failures and retry policy

A failed persisted tool call has `status: "failed"`, `output: null`, and an error:

```json
{
  "code": "CALL_FAILED",
  "message": "The engineer call could not be completed.",
  "retryable": false
}
```

`TIMEOUT` is also possible. Messages vary with the failure. Live call failures are
not automatically retryable: the provider may have accepted the outbound call
before a timeout or lost response. Inspect existing call/provider references and
use operator-coordinated follow-up rather than silently redialing. Stale-run
results must not authorize actions in a newer run.

## Verified example: 2026-09-19

A direct-provider call supplied `outage_time: "14:30 UTC"`. The agent spoke the
time, omitted the region and asked one combined question. The recipient answered
“Sí, lo autorizo.” Both boolean results were `true`; the agent said “Queda
registrado. Gracias.” and invoked `end_call`. Duration: 18 seconds. No email,
customer notification or recovery action was executed by that call. This verifies
the voice/provider contract; it was not an end-to-end production incident run.

Sources of truth: `packages/contracts/tools.d.ts`,
`packages/contracts/outbound-calls.d.ts`, `src/tools/types/tool.type.ts`,
`src/tools/implementations/contact-engineer.tool.ts`, and the ElevenLabs adapter.
See [provider setup](ELEVENLABS.md) and [hosted prompt](ELEVENLABS-AGENT-PROMPT.md).
