# `call_engineer`: input, outcome, and next actions

> Current runtime: voice calls are simulated only. Live call tests, provider polling and inbound voice webhooks are disabled regardless of legacy environment settings. Live-provider details below document retained historical contracts.

This is the agent-facing contract for outbound engineer calls.
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
| `questions` | array of `{key, question}` | Required, nonempty. Use stable keys and questions that the configured workflow can actually answer. Permission-only workflows do not establish technical readiness. |

No extra input keys are accepted. Do not put credentials, `outage_time`, location,
incident IDs, provider IDs, or invented contact details in this object. The server
supplies trusted execution context and the incident snapshot.

A permission workflow can collect notification and failover permissions. Do not schedule it expecting backup capacity, snapshot age or service readiness to be confirmed unless the configured workflow explicitly supports those questions.

After the plan is accepted, the native LLM function arguments are:

```json
{"stepIdentifier": "<persisted runnable call step identifier>"}
```

Use that object with `execute_step`, not with `call_engineer`. While a call is
running, do independent work or call `wait_for_input` with a concrete reason.
Do not execute the same step again or schedule another call merely to poll.

## 2. What the server sends to HappyRobot

The adapter supplies the trusted call identifier, configured engineer, incident summary, affected services, outage time, keyed questions and callback URL. Direct webhook triggers receive a flat JSON object; workflow run API requests wrap it in `payload`. Credentials stay server-side.

A valid provider run ID means the call was accepted, not answered or authorized. The authenticated callback reports the final outcome. See [HappyRobot setup](HAPPYROBOT.md) for headers, payloads and rehearsal steps. The adapter never automatically redials an ambiguous start failure.

## 3. What the incident agent receives

At the tool implementation boundary, initial acceptance returns:

```json
{"status": "in-progress", "externalReference": "call_example"}
```

`externalReference` here is the **internal engineer-call ID**, not a provider
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

Each authorization has a `value: true | false | null` and a string `rationale`.
The `authorizations` property is optional in the shared contract; missing evidence is unknown, not approved. Preserve keyed technical `answers` separately. Only literal booleans are valid permission values. A successful call status, HTTP 200 or summary does not substitute for explicit permission.
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

## Source of truth

See the [shared tool contract](../../../packages/contracts/tools.d.ts),
[outbound call contract](../../../packages/contracts/outbound-calls.d.ts),
[tool implementation](../src/tools/implementations/contact-engineer.tool.ts)
and [HappyRobot setup](HAPPYROBOT.md). Automated adapter checks and live provider rehearsals establish different levels of evidence.
