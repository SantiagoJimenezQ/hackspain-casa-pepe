# HappyRobot inbound company-priority handoff

> Current runtime: voice calls are simulated only. Live call tests, provider polling and inbound voice webhooks are disabled regardless of legacy environment settings. Live-provider details below document retained historical contracts.

Prepared 19 September 2026. HappyRobot configuration only; the separate inbound backend task owns persistence, session binding, reassessment, approval and dashboard behavior.

## Configured draft

[Open the HappyRobot inbound draft](https://platform.eu.happyrobot.ai/hackspainteam4/workflow/gd6yaww1y69a/editor/pr3b2fouwb2y).

- Workflow: `CasaPepe - Prioridad de empresa por llamada` (`01a0bb82-ef58-702c-9056-ca8cc48fe1d5`).
- Version: `01a0bb82-ef63-752f-8200-5551225c342a`.
- Selected inbound number: **<your inbound number>**. Selection is saved in the draft; live routing has not been activated or tested.
- Voice: Daniel HR, Spanish (Spain), gpt-4.1. Recording and memory disabled; maximum duration 120 seconds.
- Opening: “Coordinación de emergencias. ¿Qué empresa necesita priorizar?”

The caller supplies the company at runtime. The known contact Javi Palafox maps to Happy Robot, matching the source agent; other people require company clarification. The agent collects a reason only when volunteered. It does not query rankings, invent current positions, send recovery cost as capacity, or claim the request is already applied. It submits once and acknowledges only a valid receipt, then ends the conversation. Actual spoken behavior and hangup require rehearsal.

## Backend contract to implement

This uses the version-1 payload from the company-priority backend plan, with **HappyRobot route aliases**. These routes are configured targets, not existing verified backend implementations. The HappyRobot route must record provider `happyrobot`.

Both endpoints use `x-casa-pepe-webhook-secret`. A new dedicated secret is configured in the two HTTP nodes, outside voice model parameters. Its private local copy is the ignored `apps/server/.env.happyrobot-inbound.local` file in the preparation checkout (mode 600, ignored by Git), variable `CASA_PEPE_INBOUND_WEBHOOK_SECRET`. It is not loaded automatically or deployed. The backend task can map this credential to its chosen environment variable; do not copy it into documentation or messages.

### Bind at call start

`POST https://casa-pepe-api.vercel.app/api/webhooks/happyrobot/initiation`

```json
{"conversationId":"happyrobot:<HappyRobot current.run_id>"}
```

`current.run_id` is a verified HappyRobot system variable, not an LLM parameter. This namespaced provider execution ID is **not** a Casa Pepe incident run ID. Bind it once to the active incident and return HTTP 200:

```json
{"sessionReference":"<opaque backend-generated binding>"}
```

The HTTP action runs between the inbound trigger and the voice agent. No active incident must fail without inventing a binding. The backend must preserve the original incident association across retries and reject stale sessions after reset.

### Submit during the call

`POST https://casa-pepe-api.vercel.app/api/webhooks/happyrobot/call-outcomes`

```json
{
  "schemaVersion": 1,
  "sessionReference": "<value returned by initiation>",
  "outcome": {
    "kind": "priority-request",
    "customerName": "<company named by caller>",
    "requestedPriority": "first",
    "reason": "<optional stated reason>"
  }
}
```

Only `customerName` and `reason` are model arguments. A deterministic Python node injects the session, schema version and requested priority; trims company/reason; omits an empty reason; rejects an absent session/company, company longer than 200 characters, or reason longer than 2000. It outputs an object, referenced as the entire HTTP JSON body, preserving quotes and newlines. It never sends `reportedCapacity`.

Return HTTP **202**, including identical retries:

```json
{"accepted":true,"outcomeIdentifier":"<stable receipt>","status":"received"}
```

A final deterministic tool node confirms success only for HTTP 202 with `accepted=true`, `status=received`, and a nonempty receipt ID. The agent says “He registrado la solicitud de priorizar {empresa}. El coordinador la evaluará.” Otherwise it reports failure and directs the caller to the operator. Receipt is not permission to execute recovery or proof of identity.

Implement the plan's duplicate/conflict handling, exact-name/alias resolution and unknown-company assessment on the backend. Keep unknown companies for clarification rather than silently substituting another customer. The workflow does not implement durable processing, incident reassessment, or operator approval.

## Workflow nodes

| Node | ID |
| --- | --- |
| Inbound trigger | `01a0bb82-ef75-7cfb-b67b-fc5052ed2cfc` |
| Bind session HTTP | `01a0bb84-e9dc-7289-bb04-3a9d13e13272` |
| Inbound voice | `01a0bb82-ef7b-7d30-b37f-04bac53727b2` |
| Root prompt | `01a0bb82-ef7b-7d30-b37f-04bb76674c09` |
| `registrar_prioridad_empresa` tool | `01a0bb84-effe-73a3-a54f-b6d601d94c5f` |
| Build payload | `01a0bb84-f0ff-7e2b-9029-15822d6dc222` |
| Submit HTTP | `01a0bb84-f226-7a4a-987c-5a3d3606c47f` |
| Check receipt | `01a0bb85-68e9-7856-a87d-c92f19184ec4` |

## Validation and remaining work

- Draft node configurations for the trigger, voice, initiation, payload builder and submission passed HappyRobot schema validation.
- Eleven local checks executed the exact read-back Python code: company/reason payloads, quoted text and newlines, omitted reasons, invalid sessions/names/lengths, valid and invalid receipts.
- A HappyRobot preview evaluated the upstream initiation HTTP action despite the synthetic fixture. It returned `404 Cannot POST /api/webhooks/happyrobot/initiation`; the dependent payload test correctly rejected the missing session. No successful backend binding or submission was demonstrated. Do not assume node preview/testing is isolated from upstream HTTP calls.
- HappyRobot reported zero workflow runs. The workflow remains unpublished; no phone call was placed.
- The phone inventory reports `sip_trunk_status: none` for the selected Twilio number. The trigger schema accepts its internal platform phone ID. Live SIP provisioning/routing still needs verification before a callable demo can be claimed. No phone purchase or routing takeover was performed.

Before demo activation: deploy the two backend endpoints and matching secret; confirm response shapes; resolve inbound SIP routing; publish the workflow; then call the selected number during an active incident and verify receipt, coordinator assessment, operator approval and the resulting plan. Test a different company, unknown company, duplicate submission, expired session and submission failure. HappyRobot configuration validation alone does not establish end-to-end demo readiness.
