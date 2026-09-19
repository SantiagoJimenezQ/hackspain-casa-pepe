# Outbound voice calls

`call_engineer` (and its legacy alias `contact_engineer`) uses the server's `EngineerCallAdapter`. The same tool can simulate a call, start the existing ElevenLabs emergency agent, or trigger a HappyRobot workflow. Provider credentials never enter browser code.

## Configure ElevenLabs

Copy `apps/server/.env.example` to an ignored `.env.local` and configure the usual database/API settings. Set:

```dotenv
ENGINEER_CALL_MODE=live
ENGINEER_CALL_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=<secret supplied separately>
ELEVENLABS_AGENT_ID=<existing agent ID from your colleague>
ELEVENLABS_PHONE_NUMBER_ID=<existing phone-number ID from your colleague>
ELEVENLABS_POLL_INTERVAL_MILLISECONDS=5000
DEMO_ENGINEER_NAME=<test recipient name>
DEMO_ENGINEER_PHONE=<test recipient in E.164 format>
```

The phone-number ID selects the outbound line. `DEMO_ENGINEER_PHONE` is the destination, not the outbound caller ID. Voice selection stays in the hosted agent, so a separate voice ID is not needed. The application does not PATCH that agent, its prompt, or its built-in `end_call` tool.

Verify the API key locally with the ElevenLabs `GET /v1/convai/agents` endpoint, using the `xi-api-key` header. Keep credentials in the ignored server environment or your secret manager; do not paste them into documentation or commit them.

The supplied `elevenlabs/GUIA-AGENTE.md`, `agent.json`, and `llamada.json` were not present on main during implementation. The adapter uses the provided dynamic variable and result names, plus the official API contracts:

- [Outbound call via Twilio](https://elevenlabs.io/docs/api-reference/integrations/twilio/outbound-call)
- [Conversation details](https://elevenlabs.io/docs/api-reference/conversations/get)

## Runtime behavior

The adapter sends `contact_name`, `location`, `incident_description`, and `services_down` as `conversation_initiation_client_data.dynamic_variables`. Incident context comes from the persisted run. The incident description is limited to two sentences to keep the opening concise.

`providerReference` stores ElevenLabs' `conversation_id`; `providerCallSid` stores Twilio's `callSid`. Pending call records live in the database. The server polls conversation details until analysis is ready or the configured call timeout is reached; no publicly reachable ElevenLabs callback endpoint is required. Keep the NestJS process running for scheduled polling. A request-only/serverless deployment needs a persistent worker or an equivalent scheduler.

Post-call results retain the transcript, summary, and structured authorization evidence:

- `authorizations.notifyAllClients`: `{ value: boolean | null, rationale: string }`
- `authorizations.trafficFailoverAuthorized`: `{ value: boolean | null, rationale: string }`

Only literal booleans count as answers; missing, malformed, or textual values remain `null`. These permissions do not confirm backup capacity or deployment readiness, and do not replace an operator's approval of a specific recovery plan. The colleague's hosted agent asks these two permission questions, not the existing scenario's technical questions. Technical facts may therefore remain unconfirmed after a successful call.

The hosted prompt's promise to email a report does not send one. This integration does not add an email webhook to ElevenLabs. Casa Pepe's separate `send_incident_email` tool still requires its own provider configuration and execution.

## Rehearsal

1. Start the backend with the above settings and a working database. Confirm its health response reports the chosen mode/provider.
2. Start the Spanish scenario with `POST /api/demo/start` and body `{ "scenarioIdentifier": "meteorite-eu-west-1-es" }`.
3. Trigger `POST /api/demo/impact`. This initiates a real call to the configured recipient; perform this step only when the recipient is ready for the test.
4. Inspect authenticated `GET /api/engineers/calls` and `GET /api/tools/calls`. Confirm the call has both external IDs, reaches a terminal state, and retains the two values and rationales.
5. Inspect `/api/activity` or `/api/overview` for the call's audit trail. Verify unanswered technical questions remain unconfirmed and recovery still uses plan-specific approvals.

These API calls require `Authorization: API <API_KEY>`. Automated tests mock provider requests and place no calls. Successful local tests do not establish that the hosted agent, phone routing, API key permissions, or deployment work together; a real rehearsal remains required.

Outbound POST requests are not retried inside the ElevenLabs adapter. If a start request times out, check the provider before making another call: the phone may already be ringing. There is a crash window between provider acceptance and persisting its IDs; this implementation does not promise exactly-once telephony across process crashes. Run a single coordinator instance.

## Switch to HappyRobot

Set `ENGINEER_CALL_PROVIDER=happyrobot`, keep `ENGINEER_CALL_MODE=live`, and supply the existing `HAPPYROBOT_TRIGGER_URL`, `HAPPYROBOT_API_KEY`, `HAPPYROBOT_WEBHOOK_SECRET`, and publicly reachable `PUBLIC_BASE_URL`. Configure the workflow to return the existing `/api/webhooks/happyrobot` result contract. No tool or agent call-site changes are needed. Finish pending calls before changing provider configuration.

To rehearse offline, set `ENGINEER_CALL_MODE=simulated`. For existing deployments that do not set it, `HAPPYROBOT_MODE` remains the compatibility fallback. Simulation does not call either provider.
