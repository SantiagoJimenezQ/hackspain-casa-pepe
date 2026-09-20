# Backend curl test guide

Run the numbered walkthrough in order, in the same **Bash** session. It tests authentication, observation, planning, changing capacity, stale approvals, recovery, and audit records. Optional sections exercise additional endpoints independently after the walkthrough.

Requirements: a running backend with its database configured, `curl` 7.76+ (`--fail-with-body`), and `jq`. See [backend setup](../README.md) and the [API reference](API.md).

The mandatory walkthrough is also covered by the in-process HTTP contract suite at [`src/api-curl-guide.spec.ts`](../src/api-curl-guide.spec.ts). It uses in-memory repositories and simulated adapters, so CI can validate the same API behavior without a deployment, Postgres, `curl`, or `jq`:

```bash
pnpm --filter @casa-pepe/server test
```

The curl walkthrough remains useful as a deployment smoke test; the automated suite is the deterministic CI check.

Use a dedicated test deployment/database. Starting a run replaces the active run for this session; clearing learning deletes only this session’s insights. For repeatable results, configure the **server** with `HAPPYROBOT_MODE=simulated`, `RECOVERY_MODE=simulated`, and `INCIDENT_EMAIL_MODE=simulated`. Existing outbound webhook subscriptions still receive events. Other sessions can run concurrently.

## 1. Configure the client

Provide `API_KEY` through your environment before running this block. It must match the backend's configured key. `BASE_URL` includes `/api` and can point to localhost or your deployed backend.

```bash
set -euo pipefail
: "${API_KEY:?Provide the backend API_KEY as an environment variable}"
export BASE_URL="${BASE_URL:-http://localhost:3000/api}"
BASE_URL="${BASE_URL%/}"

# Shared curl options. Authentication is a header, not a URL parameter.
ADMIN_CURL=(--silent --show-error --fail-with-body --connect-timeout 10 --max-time 60
  --header "Authorization: API ${API_KEY}"
  --header 'Content-Type: application/json')
BROWSER_TOKEN="${BROWSER_TOKEN:-$(openssl rand -hex 32)}"
CURL=("${ADMIN_CURL[@]}" --header "X-Casa-Pepe-Session: $BROWSER_TOKEN")

# Poll GET responses until a jq assertion passes; never retry mutations.
# Prints the matching JSON for inspection or ID extraction.
wait_for() {
  local endpoint="$1" predicate="$2" delay="${3:-1}" attempts="${4:-60}" response attempt
  local -a options=("${CURL[@]}")
  if [[ "$endpoint" == /tools/tests/* ]]; then options=("${ADMIN_CURL[@]}"); fi
  for ((attempt=1; attempt<=attempts; attempt++)); do
    response=$(curl "${options[@]}" "${BASE_URL}${endpoint}") || return 1
    if jq -e "$predicate" >/dev/null <<<"$response"; then
      printf '%s\n' "$response"
      return 0
    fi
    sleep "$delay"
  done
  printf 'Timed out waiting for %s\n%s\n' "$endpoint" "$response" >&2
  return 1
}
```

Commands stop on transport/HTTP errors or failed `jq -e` assertions. The poll allows 60 attempts (slow requests extend elapsed time). On a timeout, inspect `/agent/status`, `/tools/calls`, and server logs before rerunning. IDs, timestamps, and activity counts change between runs; compare behavior instead of entire JSON bodies.

## 2. Health and authentication

```bash
# Public endpoint: expect 200 and status "ok"; a database outage can return 503.
curl --silent --show-error --fail-with-body --max-time 15 \
  "$BASE_URL/health" | jq -e '.status == "ok"'

# Deliberately omit authentication. Do not use --fail-with-body here.
HTTP_CODE=$(curl --silent --show-error --max-time 15 --output /dev/null \
  --write-out '%{http_code}' "$BASE_URL/scenarios")
test "$HTTP_CODE" = 401

# Authenticated, run-independent discovery: expect JSON arrays.
curl "${CURL[@]}" "$BASE_URL/scenarios" | jq -e 'type == "array"'
curl "${CURL[@]}" "$BASE_URL/scenarios/meteorite-eu-west-1" | jq .
curl "${CURL[@]}" "$BASE_URL/tools" | jq .
```

The scheme is `Authorization: API …`, not `Bearer …`. These commands do not print the key; avoid shell tracing (`set -x`).

## Optional: standalone tool checks

These checks run without starting or changing an incident. They use a dedicated result table and synthetic content. Simulated requests finish immediately and never contact Resend, ElevenLabs or HappyRobot.

```bash
# Discover the available test tools and whether live mode is configured.
curl "${ADMIN_CURL[@]}" "$BASE_URL/tools/tests" | jq .

# Synthetic email: the server's configured recipient is used only in live mode.
EMAIL_TEST=$(curl "${ADMIN_CURL[@]}" -X POST "$BASE_URL/tools/tests" --data '{
  "tool":"send_incident_email",
  "mode":"simulated",
  "idempotencyKey":"curl-tool-test-email-1"
}')
EMAIL_ID=$(jq -er '.identifier' <<<"$EMAIL_TEST")
jq -e '.tool == "send_incident_email" and .mode == "simulated" and .status == "succeeded"' <<<"$EMAIL_TEST"

# Synthetic engineer call: simulated mode accepts the same engineer shape as live mode.
CALL_TEST=$(curl "${ADMIN_CURL[@]}" -X POST "$BASE_URL/tools/tests" --data '{
  "tool":"call_engineer",
  "mode":"simulated",
  "idempotencyKey":"curl-tool-test-call-1",
  "engineer":{"name":"Marta Ruiz","phone":"+34600000000"}
}')
CALL_ID=$(jq -er '.identifier' <<<"$CALL_TEST")
jq -e '.tool == "call_engineer" and .mode == "simulated" and .status == "succeeded"' <<<"$CALL_TEST"
curl "${ADMIN_CURL[@]}" "$BASE_URL/tools/tests/$EMAIL_ID" | jq .
curl "${ADMIN_CURL[@]}" "$BASE_URL/tools/tests/$CALL_ID" | jq .
```

Set `ENGINEER_CALL_MODE=live` and `ENGINEER_CALL_PROVIDER=elevenlabs` with the three `ELEVENLABS_*` credentials described in [voice setup](ELEVENLABS.md), or select `happyrobot` with its configuration. The POST body is the same for either call provider.

Live mode is opt-in and can contact external providers. Run these commands only with a test recipient and engineer number, and only after confirming `liveAvailable` in the catalog:

```bash
# Live email reports provider acceptance; it does not prove inbox delivery.
LIVE_EMAIL=$(curl "${ADMIN_CURL[@]}" -X POST "$BASE_URL/tools/tests" --data '{
  "tool":"send_incident_email",
  "mode":"live",
  "idempotencyKey":"curl-tool-test-live-email-1"
}')
jq -e '.tool == "send_incident_email" and .mode == "live" and (.status == "accepted" or .status == "succeeded")' <<<"$LIVE_EMAIL"

# Calls use ENGINEER_CALL_PROVIDER. ElevenLabs needs GET polling; HappyRobot uses its callback.
LIVE_CALL=$(curl "${ADMIN_CURL[@]}" -X POST "$BASE_URL/tools/tests" --data '{
  "tool":"call_engineer",
  "mode":"live",
  "idempotencyKey":"curl-tool-test-live-call-1",
  "engineer":{"name":"Test engineer","phone":"+34600000000"}
}')
LIVE_CALL_ID=$(jq -er '.identifier' <<<"$LIVE_CALL")
# Keep polling until ElevenLabs analysis is ready or HappyRobot posts its callback; the server marks
# the accepted call as failed after its configured timeout.
wait_for "/tools/tests/$LIVE_CALL_ID" '.status == "succeeded" or .status == "failed"' 5 72 | jq .
```

For `ENGINEER_CALL_PROVIDER=happyrobot` only, if you need to exercise the callback route itself, start a separate live check and immediately post a provider-signed synthetic callback. This verifies authentication and result handling; it does not prove that a phone call was answered:

```bash
CALLBACK_TEST=$(curl "${ADMIN_CURL[@]}" -X POST "$BASE_URL/tools/tests" --data '{
  "tool":"call_engineer",
  "mode":"live",
  "idempotencyKey":"curl-tool-test-live-callback-1",
  "engineer":{"name":"Test engineer","phone":"+34600000000"}
}')
CALLBACK_ID=$(jq -er '.identifier' <<<"$CALLBACK_TEST")
CALLBACK='{"callIdentifier":"'"$CALLBACK_ID"'","outcome":"completed","summary":"Synthetic callback received","transcript":"","answers":[]}'
curl --silent --show-error --fail-with-body --max-time 60 --header "x-happyrobot-signature: ${HAPPYROBOT_WEBHOOK_SECRET:?Set the callback secret}" --header 'Content-Type: application/json' -X POST "$BASE_URL/tools/tests/callbacks/happyrobot" --data "$CALLBACK" | jq -e '.accepted == true'
curl "${ADMIN_CURL[@]}" "$BASE_URL/tools/tests/$CALLBACK_ID" | jq -e '.status == "succeeded"'
```

Polling an ElevenLabs result performs a read-only conversation lookup; polling never starts or retries an outbound call. The returned `provider`, `providerReference`, and `providerCallSid` identify the external call, and `result.authorizations` retains the hosted agent's answers without applying them to an incident. Reusing an idempotency key with identical normalized input returns the same identifier; changing the tool, mode or engineer under that key returns `409`.

## 3. Start a clean manual run

The learning deletion below is intentional and global. Omitting it preserves prior knowledge, which can change the initial plan. `/demo/reset` alone does not clear learning.

```bash
curl "${CURL[@]}" -X DELETE "$BASE_URL/learning/insights" | jq .

START=$(curl "${CURL[@]}" -X POST "$BASE_URL/demo/start" --data '{
  "scenarioIdentifier":"meteorite-eu-west-1",
  "mode":"manual",
  "seed":42,
  "automaticEvents":false
}')
RUN_ID=$(jq -er '.runIdentifier' <<<"$START")
jq -e '.status == "normal" and all(.services[]; .status == "healthy")' <<<"$START"

curl "${CURL[@]}" "$BASE_URL/agent/status" \
  | jq -e '.engineerCallMode == "simulated" and .recoveryMode == "simulated"'
curl "${CURL[@]}" "$BASE_URL/overview?runIdentifier=$RUN_ID" | jq .
curl "${CURL[@]}" "$BASE_URL/plans/current?runIdentifier=$RUN_ID" \
  | jq -e '.kind == "none"'
```

Expect HTTP 201 from `/demo/start`; the other successful requests above return 200. The agent status checks call/recovery modes; confirm the email mode in server configuration before starting.

## 4. Trigger impact and wait for the first approval

```bash
curl "${CURL[@]}" -X POST "$BASE_URL/demo/impact" | jq .

APPROVALS=$(wait_for "/approvals?runIdentifier=$RUN_ID&status=pending" 'length > 0')
OLD_APPROVAL_ID=$(jq -er '.[0].identifier' <<<"$APPROVALS")
OLD_VERSION=$(jq -er '.[0].planVersion' <<<"$APPROVALS")

curl "${CURL[@]}" "$BASE_URL/engineers/calls?runIdentifier=$RUN_ID" | jq .
curl "${CURL[@]}" "$BASE_URL/plans/current?runIdentifier=$RUN_ID" \
  | jq -e '.kind == "plan" and
    ([.plan.priorities[] | select(.decision == "recover-now") | .serviceIdentifier]
      == ["orders-database","route-assignment","package-tracking","events-stream"])'
curl "${CURL[@]}" "$BASE_URL/approvals/$OLD_APPROVAL_ID" | jq .
curl "${CURL[@]}" "$BASE_URL/tasks?runIdentifier=$RUN_ID" | jq .
```

The engineer call completes asynchronously (default simulated delay: four seconds). Inspect approval consequences and the associated plan. Leave this approval pending for the next step.

## 5. Reduce capacity and verify replanning

```bash
curl "${CURL[@]}" -X POST "$BASE_URL/demo/twist" | jq .

wait_for "/plans/current?runIdentifier=$RUN_ID" \
  ".kind == \"plan\" and .plan.version > $OLD_VERSION and .plan.capacity.totalCapacity == 7" \
  | jq '.plan | {version, capacity, priorities, changesFromPrevious}'
wait_for "/approvals/$OLD_APPROVAL_ID" '.status == "superseded"' | jq .

# A stale approval must be rejected with HTTP 409.
HTTP_CODE=$(curl --silent --show-error --max-time 60 \
  --header "Authorization: API ${API_KEY}" --header 'Content-Type: application/json' \
  --output /dev/null --write-out '%{http_code}' \
  -X POST "$BASE_URL/approvals/$OLD_APPROVAL_ID/decision" \
  --data '{"decision":"approve","operatorName":"Curl tester","comment":"Stale approval test"}')
test "$HTTP_CODE" = 409

APPROVALS=$(wait_for "/approvals?runIdentifier=$RUN_ID&status=pending" \
  "any(.[]; .planVersion > $OLD_VERSION)")
APPROVAL_ID=$(jq -er --argjson version "$OLD_VERSION" \
  '[.[] | select(.planVersion > $version)][0].identifier' <<<"$APPROVALS")
curl "${CURL[@]}" "$BASE_URL/approvals/$APPROVAL_ID" | jq .
```

Expect seven capacity units, a newer plan with reasons for changed priorities, and package tracking/events stream postponed. Always fetch the replacement approval; IDs from older plans are no longer valid.

## 6. Approve, execute, and verify recovery

```bash
curl "${CURL[@]}" -X POST "$BASE_URL/approvals/$APPROVAL_ID/decision" \
  --data '{"decision":"approve","operatorName":"Curl tester","comment":"Approve simulated database failover"}' \
  | jq -e '.status == "approved"'

wait_for "/plans/current?runIdentifier=$RUN_ID" \
  '.kind == "plan" and .plan.status == "completed" and
   any(.plan.steps[]; .identifier == "stp_route-assignment_verify" and .status == "completed")' \
  | jq '.plan | {version, status, steps}'

curl "${CURL[@]}" "$BASE_URL/incidents/runs/$RUN_ID" \
  | jq -e '.status == "partially-recovered" and
    any(.services[]; .identifier == "orders-database" and .status == "healthy") and
    any(.services[]; .identifier == "route-assignment" and .status == "healthy") and
    any(.services[]; .identifier == "package-tracking" and .status == "down")'
curl "${CURL[@]}" "$BASE_URL/recovery/actions?runIdentifier=$RUN_ID" | jq .
curl "${CURL[@]}" "$BASE_URL/tools/calls?runIdentifier=$RUN_ID" | jq .
curl "${CURL[@]}" "$BASE_URL/learning/reports/$RUN_ID" | jq .
curl "${CURL[@]}" "$BASE_URL/learning/insights" | jq .
curl "${CURL[@]}" "$BASE_URL/plans?runIdentifier=$RUN_ID" | jq .
curl "${CURL[@]}" "$BASE_URL/activity?runIdentifier=$RUN_ID&afterSequence=0&limit=500" | jq .
```

A completed plan does not mean every service recovered: limited capacity intentionally leaves work postponed. Successful approval means the decision was recorded; only completed verification and service health establish recovery. Activity responses use `{items,total,limit,offset}`; other lists above are arrays. For more activity, request records after the last returned `items[].sequence`.

## Optional: reject an approval instead

Start again at section 3 and continue through section 5, then run this **instead of section 6**. Expect rejection to be respected in the revised plan.

```bash
curl "${CURL[@]}" -X POST "$BASE_URL/approvals/$APPROVAL_ID/decision" \
  --data '{"decision":"reject","operatorName":"Curl tester","comment":"Wait for DBA review"}' \
  | jq -e '.status == "rejected"'
wait_for "/plans/current?runIdentifier=$RUN_ID" \
  'any(.plan.priorities[]; .serviceIdentifier == "orders-database" and .decision == "postpone")' \
  | jq '.plan.priorities'
```

## Optional: task updates and manual agent cycle

```bash
TASK_ID=$(curl "${CURL[@]}" "$BASE_URL/tasks?runIdentifier=$RUN_ID&status=open" \
  | jq -er '.[0].identifier')
curl "${CURL[@]}" -X PATCH "$BASE_URL/tasks/$TASK_ID/status" \
  --data '{"status":"in-progress","note":"Investigating","updatedBy":"Curl tester"}' | jq .
curl "${CURL[@]}" -X PATCH "$BASE_URL/tasks/$TASK_ID/status" \
  --data '{"status":"done","note":"Test task completed","updatedBy":"Curl tester"}' | jq .
curl "${CURL[@]}" -X POST "$BASE_URL/agent/cycle" \
  --data '{"operatorName":"Curl tester"}' | jq .
```

If no open task exists, ID extraction fails; inspect `/tasks` and select an appropriate task. A cycle can return `completed`, `skipped`, `limit-reached`, or `failed`; HTTP 200 alone does not prove work was executed.

## Optional: incoming call and operator confirmation

Run while `$RUN_ID` is still active. The simulation endpoint requires the server's HappyRobot mode to be `simulated`. Receiving a report records untrusted information; confirmation applies the new capacity and triggers replanning.

```bash
INCOMING_BODY=$(jq -n --arg run "$RUN_ID" '{
  providerCallIdentifier:"curl-capacity-report-1", runIdentifier:$run,
  callerName:"Test engineer", summary:"Only six backup units are available", reportedCapacity:6
}')
INCOMING=$(curl "${CURL[@]}" -X POST "$BASE_URL/engineers/incoming-calls/simulate" \
  --data "$INCOMING_BODY")
INCOMING_ID=$(jq -er '.identifier' <<<"$INCOMING")

# Identical retries return the same record, without duplicating the incoming report.
curl "${CURL[@]}" -X POST "$BASE_URL/engineers/incoming-calls/simulate" \
  --data "$INCOMING_BODY" | jq -e --arg id "$INCOMING_ID" '.identifier == $id'
curl "${CURL[@]}" "$BASE_URL/engineers/incoming-calls" | jq .
curl "${CURL[@]}" -X POST "$BASE_URL/engineers/incoming-calls/$INCOMING_ID/confirm" \
  --data '{"operatorName":"Curl tester","confirmedCapacity":6}' \
  | jq -e '.status == "confirmed" and .confirmedCapacity == 6'
curl "${CURL[@]}" "$BASE_URL/incidents/current" | jq '.resources'
```

Both simulation and confirmation return 201. Reusing the provider ID with different content returns 409. Reconfirming the same capacity is idempotent; a different capacity returns 409. Reports for inactive runs return 409.

## Optional: inject a specific event and validate bad input

```bash
curl "${CURL[@]}" -X POST "$BASE_URL/demo/events" \
  --data '{"type":"fact-reported","statement":"Backup reviewed by test operator","factStatus":"confirmed","source":"Curl tester"}' | jq .
curl "${CURL[@]}" -X POST "$BASE_URL/demo/events" \
  --data '{"type":"capacity-limited","availableCapacity":7,"reason":"Explicit capacity test"}' | jq .

# Negative capacity must return 400 without applying the event.
HTTP_CODE=$(curl --silent --show-error --max-time 60 \
  --header "Authorization: API ${API_KEY}" --header 'Content-Type: application/json' \
  --output /dev/null --write-out '%{http_code}' -X POST "$BASE_URL/demo/events" \
  --data '{"type":"capacity-limited","availableCapacity":-1}')
test "$HTTP_CODE" = 400
```

## Optional: seeded simulation controls

This starts a different active run. Repeating the seed, difficulty, event options, and explicit advances makes scenario generation reproducible; asynchronous agent timing, prior learning, IDs, and timestamps can still differ. Pause controls the simulation clock, not in-flight agent/provider work.

```bash
curl "${CURL[@]}" -X POST "$BASE_URL/demo/start" --data '{
  "scenarioIdentifier":"meteorite-eu-west-1", "mode":"randomized",
  "seed":42, "difficulty":"medium", "automaticEvents":false,
  "maxConcurrentDisruptions":2
}' | jq .
curl "${CURL[@]}" -X POST "$BASE_URL/demo/impact" | jq .
curl "${CURL[@]}" -X POST "$BASE_URL/demo/pause" | jq .
curl "${CURL[@]}" -X POST "$BASE_URL/demo/advance" --data '{"minutes":5}' | jq .
curl "${CURL[@]}" -X POST "$BASE_URL/demo/resume" | jq .
curl "${CURL[@]}" -X POST "$BASE_URL/demo/pause" | jq .
```

## Optional: public status and event stream

```bash
# Public JSON and HTML. No operator key required.
curl --silent --show-error --fail-with-body --max-time 15 "$BASE_URL/status/public?runIdentifier=$RUN_ID" | jq .
curl --silent --show-error --fail-with-body --max-time 15 "$BASE_URL/status?runIdentifier=$RUN_ID"

# A finite observation window. Exit 28 is expected when the stream times out.
curl --silent --show-error --fail-with-body --no-buffer --max-time 15 \
  --header "Authorization: API ${API_KEY}" \
  --header "X-Casa-Pepe-Session: $BROWSER_TOKEN" \
  "$BASE_URL/activity/stream?runIdentifier=$RUN_ID&afterSequence=0&limit=500" \
  || { CURL_EXIT=$?; test "$CURL_EXIT" -eq 28; }
```

Public status reflects explicitly published updates; it may have no publication yet. SSE uses `event`, `id`, and JSON `data` fields. `$RUN_ID` selects the walkthrough run even if you started another run. Reconnect using the last event ID as `afterSequence`; page large backlogs through `/activity` first.

## Optional: replay and reset

Run these last: both change the active run. Replay re-emits recorded events without executing agent tools; existing webhook subscribers still receive replay activity.

```bash
curl "${CURL[@]}" "$BASE_URL/incidents/runs" | jq .
curl "${CURL[@]}" -X POST "$BASE_URL/replays" \
  --data "$(jq -n --arg run "$RUN_ID" '{sourceRunIdentifier:$run,speedFactor:4}')" | jq .
wait_for '/replays/status' '.status == "finished"' | jq .
curl "${CURL[@]}" -X POST "$BASE_URL/demo/reset" | jq .
curl "${CURL[@]}" "$BASE_URL/incidents/current" | jq -e '.status == "normal"'
```

Replay start returns 201; reset returns 200. Long replays can exceed the polling budget; inspect `/replays/status` before resetting. To repeat the baseline, rerun sections 3–6, capturing fresh IDs.

## Provider webhook authentication

The operator `API_KEY` does **not** authenticate inbound provider callbacks. `/webhooks/happyrobot` and `/webhooks/happyrobot/incoming` require `x-happyrobot-signature` with `HAPPYROBOT_WEBHOOK_SECRET`; `/webhooks/recovery` requires `x-recovery-signature` with `RECOVERY_WEBHOOK_SECRET`. These are separate server-configured secrets. The API-key-only walkthrough uses simulated adapters instead. See [callback payloads](API.md#inbound-webhooks-public-with-secret) for provider integration tests.

This guide is checked against the backend controllers, DTOs, and existing integration-test expectations. Running the commands against your target deployment is still required to verify that deployment.
