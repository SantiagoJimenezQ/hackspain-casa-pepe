# HappyRobot outbound permission calls

The HappyRobot adapter supports the EU v2 API and existing trigger URLs. Calls use the same `call_engineer` tool and operator dashboard as ElevenLabs. Provider changes do not authorize recovery or send customer notifications.

## Draft prepared on 2026-09-19

[Open the unpublished workflow](https://platform.eu.happyrobot.ai/hackspainteam4/workflow/x1dasevgnmnv/editor/s5d81c2jj3ue).

The original empty `CasaPepe` workflow is preserved. The new draft is `CasaPepe - Autorizaciones de emergencia`, workflow `01a0bb6b-9b3f-76c7-ae9b-0793fefa5e27`, version `01a0bb6b-9b4b-73c5-a067-d33516c637c3`.

The draft uses a Spanish (Spain) voice, a short combined permission question, one clarification at most, and explicit handling of partial or missing permissions. An unequivocal early yes approves both actions, including before the permission question is complete or during an interrupted opening. Explicit limits override a general yes and remain separate for each action. Silence, greetings without affirmation and unclear answers remain unknown. It does not invent a missile strike from unrelated or synthetic input. It preserves the supplied outage timezone rather than applying a hardcoded summer-time offset.

Flow:

1. Protected predefined webhook receives the call identifier, recipient and incident context.
2. Outbound Spanish voice agent asks whether to notify clients and redirect traffic.
3. `registrar_autorizacion` sends immediate evidence when both decisions are explicit booleans. Missing decisions are left for nullable post-call extraction.
4. Post-call extraction retains each permission as `true`, `false` or `null`, its rationale, and a summary.
5. A Python sandbox maps telephony status to `completed`, `failed` or `no-answer`; unknown states fail conservatively.
6. Authenticated callback delivers the final transcript and result to the URL supplied by Casa Pepe.

The voice differs from ElevenLabs: Daniel HR in Spanish (Spain). A real rehearsal must verify interruption handling, pronunciation, start timing and hangup. No workflow run or phone call was started during configuration. Synthetic tests invoke only extraction and status nodes, never voice or callbacks.

## Server configuration

```dotenv
ENGINEER_CALL_PROVIDER=happyrobot
ENGINEER_CALL_MODE=live
HAPPYROBOT_TRIGGER_URL=https://platform.eu.happyrobot.ai/api/v2/workflows/01a0bb6b-9b3f-76c7-ae9b-0793fefa5e27/runs
HAPPY_ROBOT_API_KEY=<workspace API key>
HAPPYROBOT_WEBHOOK_SECRET=<new dedicated callback secret>
PUBLIC_BASE_URL=<public origin of the deployed API>
```

`HAPPYROBOT_API_KEY` remains supported and takes precedence over `HAPPY_ROBOT_API_KEY`. A shell-only variable must be added to the deployment environment separately. Use the v2 EU endpoint: the legacy v1 API rejects this workspace key. V2 needs Bearer authentication and `{ "payload": { ... } }`; the adapter supplies that envelope and persists the returned `run_id`. Direct legacy trigger URLs retain their previous flat payload.

The new workflow has its own generated trigger credential and its own generated callback credential. Existing ElevenLabs and deployment secrets were not changed. The trigger credential is separate from the v2 workspace API key. Private preparation files are stored with restricted permissions outside Git; never copy raw provider exports or credential values into this document.

Deploy this backend change and configure the callback secret before publishing the draft. Finish pending calls before changing providers. Preserve the existing deployed provider until the new integration passes a deliberate live rehearsal. Publishing or switching production was not part of the preparation step.

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

Preparation validation passed: 8 focused backend suites (62 tests), TypeScript checking and the server build. HappyRobot synthetic extraction correctly retained both approvals, partial approval/refusal, missing answers and an early affirmative before the permission question. The early-affirmative policy was subsequently updated at the user’s request to return true for both permissions; extraction tests cover an interrupted question and an early partial approval as well. Synthetic status tests covered completed, unanswered and failed calls. These checks do not validate a real phone conversation or callback delivery. The workflow has zero runs.

The local preparation environment is in the ignored, restricted-permission `apps/server/.env.happyrobot.local` file in this isolated checkout. It keeps call mode simulated and is not loaded automatically. Transfer its dedicated callback credential through deployment secret settings when deploying; do not commit it.

Use `POST /api/tools/tests` with `tool: "call_engineer"`, `mode: "live"`, a fresh idempotency key and an intended recipient. Do this only when the recipient is ready. Poll its result until terminal; HappyRobot callbacks complete it without ElevenLabs polling. Test acceptance, refusal, partial permission, interruption, unknown answers and an unanswered call. Confirm the result, transcript and operator approval boundary before switching the incident demo.

Never retry an ambiguous start failure automatically: the provider may already have dialed. This integration retains the existing single-coordinator and provider-acceptance/persistence crash-window limitations.
