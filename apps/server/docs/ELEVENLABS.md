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

## Agent setup in the ElevenLabs dashboard

The application never edits the hosted agent, so its prompt and its Analysis fields are configured
once in the ElevenLabs dashboard.

### Dynamic variables the server sends

Every outbound call carries these, usable in the prompt as `{{name}}`:

| Variable | Contents |
|---|---|
| `contact_name` | Person being called |
| `incident_description` | Two-sentence summary of the incident |
| `location` | Affected region |
| `outage_time` | Start of the outage in `HH:MM UTC`, empty when unknown |
| `services_down` | Comma-separated list of affected services |
| `questions` | The agent's questions, numbered, as a single line |
| `questions_count` | How many questions were sent |

The prompt should ask the `{{questions}}` one at a time and wait for a clear answer to each,
instead of following a fixed script, because the questions are written per incident by the agent.

### Data collection fields

Analysis, Data collection. Each field becomes an entry in `analysis.data_collection_results`.

Authorizations, read into `result.authorizations`:

| Identifier | Type |
|---|---|
| `notify_all_clients` | Boolean |
| `traffic_failover_authorized` | Boolean |

Question answers, read into `result.answers`, one field per question key used by the scenario:

| Identifier | Type |
|---|---|
| `database-snapshot` | Boolean |
| `route-assignment-readiness` | Boolean |
| `backup-capacity` | Boolean |

The identifier must match the question `key`. Separators are forgiving: `database-snapshot`,
`database_snapshot` and `databaseSnapshot` all match. A Boolean field decides `confirmed` directly
and its rationale becomes the answer text; a String field leaves the verdict to the server's answer
interpretation. A question with no matching field simply produces no answer, and its fact stays
pending.

## Runtime behavior

The adapter sends `contact_name`, `location`, `outage_time`, `incident_description`, and `services_down` as `conversation_initiation_client_data.dynamic_variables`. Incident context comes from the persisted run. The incident description is limited to two sentences to keep the opening concise.

The hosted prompt now omits all location names and region codes. Direct callers
can supply `outage_time` in the same dynamic variables object, for example
`"outage_time": "14:30, hora de Madrid"`. This must be the actual incident start
time, not the call time. The hosted default is empty; if absent, the agent omits
the time rather than inventing one. The server sends the persisted incident's
`impactedAt` through `outageStartedAt`, formatted as `HH:mm UTC` in `outage_time`.
Legacy calls, standalone checks and invalid timestamps send an empty value;
the call start time is never substituted. This prompt update was saved and read back through the API;
a subsequent direct-provider call verified the time was spoken and the region omitted (see the contract linked below).

`providerReference` stores ElevenLabs' `conversation_id`; `providerCallSid` stores Twilio's `callSid`. Pending call records live in the database. The server polls conversation details until analysis is ready or the configured call timeout is reached; no publicly reachable ElevenLabs callback endpoint is required. Keep the NestJS process running for scheduled polling. A request-only/serverless deployment needs a persistent worker or an equivalent scheduler.

Post-call results retain the transcript, summary, and structured authorization evidence:

- `authorizations.notifyAllClients`: `{ value: boolean | null, rationale: string }`
- `authorizations.trafficFailoverAuthorized`: `{ value: boolean | null, rationale: string }`

Only literal booleans count as answers; missing, malformed, or textual values remain `null`. These permissions do not confirm backup capacity or deployment readiness, and do not replace an operator's approval of a specific recovery plan. The hosted agent requests these two permissions in one combined question, rather than asking the scenario's technical questions. Technical facts may therefore remain unconfirmed after a successful call.

The hosted prompt was updated through the ElevenLabs API on 2026-09-19 to use an opening of at most 35 words and one combined permission question. See the [saved prompt](ELEVENLABS-AGENT-PROMPT.md). The hangup rule and both extraction descriptions were updated and verified by reading the agent back. A clear yes/no to the complete combined question applies to both permissions; partial answers remain separate and ambiguous or missing answers remain null. Voice and model settings were preserved. A subsequent live call verified the shorter opening and combined permission extraction, with the remaining issues recorded below.

The revised prompt removes the promise to email a report. This integration does not add an email webhook to ElevenLabs. Casa Pepe's separate `send_incident_email` tool still requires its own provider configuration and execution.

## Direct-provider rehearsal findings (2026-09-19)

Two real calls were placed with `curl` directly against ElevenLabs, using the
production Vercel agent, outbound line and test recipient, and the local
ElevenLabs API key. Casa Pepe's API, database, LLM and incident workflow were
not involved. The first payload explicitly described a drill. Recipient details,
credentials and the raw transcript are intentionally excluded from this record.

- Agent and phone-number discovery both returned HTTP 200. The outbound POST
  returned HTTP 200 with `success: true`, `conversation_id` and `callSid`.
- Conversation GETs observed `initiated`, `in-progress`, then `done`. The final
  response included analysis and a transcript; no public callback was needed.
- The connected call lasted 38 seconds and ended with
  `metadata.termination_reason: "Call ended by remote party"`.
- Both `analysis.data_collection_results.notify_all_clients.value` and
  `traffic_failover_authorized.value` were `null`. The analysis explained that
  the respective questions had not been asked. A generic affirmative utterance
  in an interrupted exchange did not establish either permission.
- `analysis.call_successful` was `"success"` despite both unanswered questions.
  Call completion and authorization collection must remain separate. The adapter
  already preserves this distinction; a sanitized regression test covers it.
- The transcript showed repeated introductions following interruptions and an
  email promise. The hosted agent has an `end_call` tool but no email tool.
  This run did not send an email through Casa Pepe.

Historical rehearsal note: this call predates the switch to missile wording; new runs use the updated scenario narrative.

The second call used the Spanish scenario's actual incident context without
simulation wording: a meteorite takes AWS Dubái (`me-central-1`) offline,
affecting Gulf Relay's orders database, route assignment, package tracking and
event stream, with roughly 4,000 deliveries blocked per hour. The four dynamic
variables were accepted without changing the hosted agent.

- The outbound POST returned HTTP 200 and both provider identifiers.
- Polling observed `in-progress`, `processing` (analysis still `null`), and
  `done` with the final transcript and analysis.
- The call lasted 55 seconds. Both authorization values were literal `true`,
  each with a rationale tied to an affirmative answer to its specific question.
- The agent delivered the closing phrase and invoked `end_call`;
  `metadata.termination_reason` was `"end_call tool was called."`.
- The transcript still showed an introduction restart after interruptions and
  the unsupported promise to send an email. No Casa Pepe email or recovery
  action was executed by this direct-provider test.

Follow-up: the hosted prompt now asks one combined question, instructs the agent
to resume after interruptions and removes the email promise, as described above.
These prompt changes were made after both calls; the subsequent rehearsal is recorded below.
Showing unanswered permissions explicitly wherever a completed call is shown
remains product work. The second call validates a complete two-answer conversation and
agent-triggered hangup at the provider level. Do not automatically redial to
collect missing answers.

The verified provider endpoints were:

```text
GET  https://api.elevenlabs.io/v1/convai/agents
GET  https://api.elevenlabs.io/v1/convai/phone-numbers
POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call
GET  https://api.elevenlabs.io/v1/convai/conversations/<conversation_id>
```

Use `xi-api-key` authentication and the dynamic variables documented above.
The successful direct request validates provider connectivity and the request
shape, not the deployed Casa Pepe integration end to end.

## Standalone API test

With the settings above, use `POST /api/tools/tests` without starting an incident:

```json
{
  "tool": "call_engineer",
  "mode": "live",
  "idempotencyKey": "elevenlabs-check-001",
  "engineer": { "name": "Test engineer", "phone": "+34600000000" }
}
```

Use an intended test recipient. The adapter sends synthetic incident context to the existing hosted agent. Poll `GET /api/tools/tests/<identifier>` every five seconds until `succeeded` or `failed`; each pending ElevenLabs GET checks conversation details. No public callback or incident scheduler is needed for these standalone tests. Results retain conversation ID, call SID, transcript, summary and authorization evidence, but never create incident approvals or start recovery. `GET /api/tools/tests` reports the selected provider and whether its live configuration is present. Reuse the same idempotency key to retrieve the original execution without redialing.

## Rehearsal

1. Start the backend with the above settings and a working database. Confirm its health response reports the chosen mode/provider.
2. Start the Spanish scenario with `POST /api/demo/start` and body `{ "scenarioIdentifier": "meteorite-eu-west-1-es" }`.
3. Trigger `POST /api/demo/impact`. This initiates a real call to the configured recipient; perform this step only when the recipient is ready for the test.
4. Inspect authenticated `GET /api/engineers/calls` and `GET /api/tools/calls`. Confirm the call has both external IDs, reaches a terminal state, and retains the two values and rationales.
5. Inspect `/api/activity` or `/api/overview` for the call's audit trail. Verify unanswered technical questions remain unconfirmed and recovery still uses plan-specific approvals.

These API calls require `Authorization: API <API_KEY>`. Automated tests mock provider requests and place no calls. Successful local tests do not establish that the hosted agent, phone routing, API key permissions, or deployment work together; a real rehearsal remains required.

Outbound POST requests are not retried inside the ElevenLabs adapter. If a start request times out, check the provider before making another call: the phone may already be ringing. There is a crash window between provider acceptance and persisting its IDs; this implementation does not promise exactly-once telephony across process crashes. Run a single coordinator instance.

## Switch to HappyRobot

See [HappyRobot setup and permission parity](HAPPYROBOT.md) for the EU v2 workflow and callback contract.

Set `ENGINEER_CALL_PROVIDER=happyrobot`, keep `ENGINEER_CALL_MODE=live`, and supply the existing `HAPPYROBOT_TRIGGER_URL`, `HAPPYROBOT_API_KEY`, `HAPPYROBOT_WEBHOOK_SECRET`, and publicly reachable `PUBLIC_BASE_URL`. Configure the workflow to return the existing `/api/webhooks/happyrobot` result contract. No tool or agent call-site changes are needed. Finish pending calls before changing provider configuration.

To rehearse offline, set `ENGINEER_CALL_MODE=simulated`. For existing deployments that do not set it, `HAPPYROBOT_MODE` remains the compatibility fallback. Simulation does not call either provider.

For incident calls, set `SIMULATED_CALL_ALWAYS_AUTHORIZED=true` alongside
`ENGINEER_CALL_MODE=simulated` to return `true` for both
`authorizations.notifyAllClients.value` and
`authorizations.trafficFailoverAuthorized.value`. Each rationale explicitly labels
this as simulated authorization. The flag defaults to `false`; live calls and
standalone `/tools/tests` synthetic fixtures are unaffected. It does not approve
plan actions or bypass operator approval. Optionally set
`SIMULATED_CALL_DELAY_MILLISECONDS=0` for immediate asynchronous completion.
Restart the server after changing these environment variables.

## Troubleshoot failed tests

The public API keeps provider failures generic (`CALL_PROVIDER_ERROR`). Server logs now retain sanitized diagnostics. On Vercel, open the API project's **Logs**, choose the production deployment and the time of the attempt, and search for the returned `tool-test_...` identifier. Starting a call logs under `POST /api/tools/tests`; polling errors occur under `GET /api/tools/tests/:identifier`.

Look for:

- `elevenlabs_provider_failure`: failure stage, start/result operation, call identifier, conversation ID/call SID if available, elapsed time, configured timeout, HTTP status, provider request IDs, and sanitized provider error body. Request exceptions retain their message, stack and cause.
- `tool_test_provider_failure`: test identifier, tool/provider/mode and the adapter failure reason or caught exception. This also covers standalone email and HappyRobot failures.

Credentials, authorization/cookie fields, configured secret values, recipient details and conversation content are redacted; diagnostic depth and text length are bounded. Request headers and call payloads are not logged. API responses remain generic. A timeout can occur after the provider accepted a call, so check the conversation ID in ElevenLabs or the call SID in Twilio before retrying. These logs become available after deploying this change; they cannot recover details discarded by earlier deployments.

## Short-prompt live verification (2026-09-19)

A direct curl retry with the same recipient and incident reached `done` after
30 seconds, compared with 55 seconds for the earlier completed call (about 45%
shorter in this single comparison). Both permissions were returned as literal
`true`, with rationales citing explicit authorization of both actions. The agent
closed with the expected phrase and invoked `end_call`. There was no email
promise or repeated introduction.

The agent delivered the combined permission question in its opening, but then
asked for confirmation after the first affirmative response was transcribed with
extra unclear words. The recipient explicitly authorized both actions. This
validates the combined extraction and hangup, but not a strict one-question flow:
the clarification was longer than intended. The agent also read `me-central-1`
despite the prompt instruction to omit technical region codes. The subsequent
prompt update replaces location with `outage_time` and forbids all location
references. A subsequent direct-provider call with `outage_time: "14:30 UTC"` completed
in 18 seconds, omitted the region, asked one combined question, captured both
permissions as `true`, and invoked `end_call`. It did not require clarification.
The longer clarification observed in this earlier call remains relevant when
responses are ambiguous.

Agent input, asynchronous results and next-action rules: [call_engineer contract](CALL-ENGINEER-CONTRACT.md).
