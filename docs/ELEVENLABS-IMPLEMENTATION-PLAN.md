# ElevenLabs outbound calls implementation plan

Branch: `codex/elevenlabs-outbound-calls`, isolated worktree from `origin/main` at `c74f061`.

1. Establish a provider-neutral call context, provider identity, external references, and structured authorization evidence. Preserve `call_engineer` and `contact_engineer` compatibility.
2. Implement an ElevenLabs adapter using the existing configured agent. Send the four dynamic variables; retain conversation ID and Twilio call SID. Read post-call analysis without changing the hosted agent.
3. Select simulated, ElevenLabs, or HappyRobot calls through server configuration. Persist pending calls and poll their results with timeouts, stale-run protection, audit events, and restart recovery. Do not automatically redial ambiguous failures.
4. Keep voice authorization evidence separate from plan-specific operator approvals and technical capacity facts. Missing/non-boolean answers remain unknown.
5. Test provider requests, delayed analysis, failures, provider selection, persistence, restart polling, and compatibility. Run backend lint, typecheck, tests, and build.
6. Document credentials, destination configuration, smoke testing, and switching providers. Live validation requires an API key and a test recipient; do not place a call as part of automated tests.

Implementation uses Luna Max subagents for adapter and runtime work. Root owns documentation, integration review, and final validation.

## Completion

Implemented with three Luna Max subagents and root integration review. Backend verification: 20 Jest suites / 79 tests passed, TypeScript passed, Biome passed, and NestJS build passed. API integration tests required permission for an ephemeral loopback listener. No live provider call was placed.

Live rehearsal still requires the ElevenLabs API key, a test recipient, the existing agent/phone-number IDs in the server environment, and a running backend with a database. The hosted agent remains unchanged; adding its email webhook is separate work.
