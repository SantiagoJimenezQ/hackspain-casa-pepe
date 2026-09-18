# Casa Pepe agent guidance

## Challenge references

- [Official HackSpain 2026 challenge brief](https://hackspain2026.happyrobot.ai/)
- [Casa Pepe GitHub repository](https://github.com/SantiagoJimenezQ/hackspain-casa-pepe)
- [Master project plan](MASTER.md)
- [Repository structure and contribution workflow](README.md)

The official challenge brief is the source of truth if this file and the brief ever disagree.

## Challenge objective

Build an agentic system that manages a crisis chosen by the team. The situation must change while the system is running, so the agent has to reassess the state and adapt instead of following a fixed script.

The system should repeatedly answer:

- What information matters now?
- What should happen first with the resources that are actually available?
- Who needs to be notified, when, and with what context?
- Where should limited resources go?
- What concrete action happens next, and who owns it?
- When is the current plan no longer valid?

## Required capabilities

Every implementation and demo should make these capabilities visible:

1. **Observe:** ingest changing signals such as calls, messages, sensors, or APIs, and show the current situation and recent changes.
2. **Prioritize:** rank open issues using the resources that remain, and explain the reason for the ordering.
3. **Coordinate and execute:** notify people, assign work, and track ownership through real interactions such as calls, messages, tickets, or API actions. The system must act, not only recommend.
4. **Adapt:** detect meaningful changes during execution and rebuild the response plan when the original plan no longer fits.

The delivery must include an agentic system, a moving scenario, a multi-step response, real interaction with people or systems, and an interface where an operator can understand the situation, see what the system is doing, and intervene. Learning from previous calls and decisions is a bonus requirement.

## Evaluation focus

The three main evaluation areas have equal weight:

- **Decision-making:** sensible decisions with incomplete information, useful prioritization, and different behavior when conditions change.
- **Action:** coordination of people, information, and resources, plus execution outside the system.
- **Supervision:** clear visibility into the agent’s work, meaningful human control, and an original scenario or management approach.

Learning from earlier executions earns extra credit. The pitch and demo should make the system’s decisions, actions, and adaptation easy to see.

## Development expectations

- Read the target folder's README before implementing. `apps/web` owns the UI, `apps/server` owns runtime integration, and `packages` separates contracts, simulation, decisions, and tool adapters.
- Agree on shared contracts in `packages/contracts` before connecting components. Keep server credentials and external integrations out of browser code.

- Keep the scenario state, incoming events, decisions, planned actions, completed actions, and human overrides auditable.
- Make the reason for each priority, notification, assignment, and plan change visible in the operator interface.
- Model resource limits and failures explicitly; do not assume every requested resource is available.
- Keep external actions behind clear, testable adapters so the demo can run deterministically and safely.
- Add or update tests when behavior changes, especially around prioritization, replanning, and human intervention.
