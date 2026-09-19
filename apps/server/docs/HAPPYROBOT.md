# HappyRobot outbound permission calls

The HappyRobot adapter supports the EU v2 API and existing trigger URLs. Calls use the same `call_engineer` tool and operator dashboard as ElevenLabs. Provider changes do not authorize recovery or send customer notifications.

## Workflow

[Open the workflow](https://platform.eu.happyrobot.ai/hackspainteam4/workflows/x1dasevgnmnv/editor/s5d81c2jj3ue).

The original empty `CasaPepe` workflow is preserved. The outbound workflow is `CasaPepe - Autorizaciones de emergencia`, workflow `01a0bb6b-9b3f-76c7-ae9b-0793fefa5e27`, version `01a0bb6b-9b4b-73c5-a067-d33516c637c3`.

The workflow uses a Spanish (Spain) voice, a short combined permission question, one clarification at most, and explicit handling of partial or missing permissions. An unequivocal early yes approves both actions, including before the permission question is complete or during an interrupted opening. Explicit limits override a general yes and remain separate for each action. Silence, greetings without affirmation and unclear answers remain unknown. It does not invent a missile strike from unrelated or synthetic input. It preserves the supplied outage timezone rather than applying a hardcoded summer-time offset.

Flow:

1. Protected predefined webhook receives the call identifier, recipient and incident context.
2. Outbound Spanish voice agent asks whether to notify clients and redirect traffic.
3. `registrar_autorizacion` sends immediate evidence when both decisions are explicit booleans. Missing decisions are left for nullable post-call extraction.
4. Post-call extraction retains each permission as `true`, `false` or `null`, its rationale, and a summary.
5. A Python sandbox maps telephony status to `completed`, `failed` or `no-answer`; unknown states fail conservatively.
6. Authenticated callback delivers the final transcript and result to the URL supplied by Casa Pepe.

The workflow uses Daniel HR in Spanish (Spain). A direct authenticated webhook rehearsal completed a 30-second call on 2026-09-20. Product acceptance must additionally verify a fresh callback record; provider workflow success alone is insufficient.

## Production configuration

```dotenv
ENGINEER_CALL_PROVIDER=happyrobot
ENGINEER_CALL_MODE=live
ENGINEER_CALL_FALLBACK_TO_SIMULATED=false
HAPPYROBOT_TRIGGER_URL=https://workflows.platform.eu.happyrobot.ai/hooks/x1dasevgnmnv
HAPPY_ROBOT_API_KEY_WEBHOOK=<key copied from the webhook enhanced-security UI>
HAPPYROBOT_WEBHOOK_SECRET=<matching backend callback secret>
PUBLIC_BASE_URL=<public origin of the deployed API>
```

Direct `/hooks/` requests send a flat JSON payload and `x-api-key`. The dedicated webhook key takes precedence over the existing API-key aliases on this route only. Copy the key from HappyRobot; do not invent one in the trigger configuration. Shell variables must also be configured in the deployment environment.

The optional `/api/v2/workflows/<workflow>/runs` route retains workspace-key Bearer authentication and a `{ "payload": { ... } }` body. `HAPPYROBOT_API_KEY` takes precedence over `HAPPY_ROBOT_API_KEY` for that route. Both routes require a nonempty provider `run_id`; acceptance means queued, not connected or completed. Ambiguous failures are never automatically redialed.

Keep webhook authentication enabled. The outbound trigger key and backend callback secret are different credentials. Keep simulated fallback disabled for live demos so a rejected real call cannot appear successful through simulation.

## Callback contract

Both `/api/webhooks/happyrobot` and `/api/tools/tests/callbacks/happyrobot` require `x-happyrobot-signature` matching `HAPPYROBOT_WEBHOOK_SECRET`.

```json
{
  "callIdentifier": "call_example",
  "phase": "completed",
  "outcome": "completed",
  "summary": "Notifications approved; failover unanswered.",
  "transcript": "Agent: ...\nUser: ...",
  "answers": [],
  "authorizations": {
    "notifyAllClients": { "value": true, "rationale": "Explicit permission." },
    "trafficFailoverAuthorized": { "value": null, "rationale": "No clear answer." }
  }
}
```

`phase` is optional for compatibility. `authorization` records evidence while preserving the pending call status and empty finish time. It never emits the call-finished event or grants a recovery approval. Incident evidence emits `engineer-call.authorization-received` for auditing. The final callback contains the full transcript and supersedes preliminary evidence. Standalone callbacks remain isolated from incidents. Late interim evidence cannot overwrite a terminal record; stale incident runs and callbacks for another provider are rejected.

Permission values must be literal JSON booleans or null, never strings. Keep both records when `authorizations` is supplied. Preserve technical `answers` separately; permission collection does not confirm backup capacity or readiness.

## Rehearsal

Check the voice node's output: `status`, `failure_reason`, SIP response and duration. HappyRobot may mark a workflow successful even when its call failed. The normalizer must deliver `failed` or `no-answer` through the callback; do not stop execution before that callback. Verify failed calls as well as completed conversations.

Use `POST /api/tools/tests` with `tool: "call_engineer"`, `mode: "live"`, a fresh idempotency key and an intended recipient. Do this only when the recipient is ready. Poll its result until terminal; HappyRobot callbacks complete it without ElevenLabs polling. Test acceptance, refusal, partial permission, interruption, unknown answers and an unanswered call. Confirm the result, transcript and operator approval boundary before switching the incident demo.

Never retry an ambiguous start failure automatically: the provider may already have dialed. This integration retains the existing single-coordinator and provider-acceptance/persistence crash-window limitations.
