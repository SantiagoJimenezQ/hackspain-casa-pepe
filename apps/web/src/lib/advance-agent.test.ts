import { describe, expect, it } from "vitest";
import {
  advanceAgentState,
  appendFollowUp,
  withAdvancedAgent,
} from "@/lib/advance-agent";
import { createInitialSnapshot } from "@/lib/mock-snapshot";
import type { AgentPhase, AgentState } from "@/lib/dashboard-types";

function agentFrom(phases: AgentPhase[], extras?: Partial<AgentState>): AgentState {
  return {
    online: true,
    completed: phases.filter((phase) => phase.status === "done").length,
    total: phases.length,
    currentReasoningKey: "agent.reasoning.current",
    phases,
    activity: phases.map((phase) => ({
      id: `act-${phase.id}`,
      type: "phase" as const,
      phaseId: phase.id,
    })),
    ...extras,
  };
}

describe("advanceAgentState", () => {
  it("does not mutate the original agent", () => {
    const snapshot = createInitialSnapshot();
    const originalStatus = snapshot.agent.phases[2]?.subagents?.[0]?.tools[1]?.status;
    advanceAgentState(snapshot.agent);
    expect(snapshot.agent.phases[2]?.subagents?.[0]?.tools[1]?.status).toBe(originalStatus);
  });

  it("completes the current running tool and leaves sibling subagents running", () => {
    const next = advanceAgentState(createInitialSnapshot().agent);
    const launch = next.phases.find((phase) => phase.id === "launch_subagents");
    const iberdrola = launch?.subagents?.find((item) => item.id === "sub-iberdrola");
    expect(iberdrola?.tools.find((tool) => tool.id === "sub-iberdrola-sync")?.status).toBe("done");
    expect(launch?.status).toBe("running");
    expect(launch?.subagents?.find((item) => item.id === "sub-santander")?.status).toBe("running");
  });

  it("marks a subagent done after its last tool finishes", () => {
    let agent = createInitialSnapshot().agent;
    agent = advanceAgentState(agent);
    agent = advanceAgentState(agent);
    const iberdrola = agent.phases
      .find((phase) => phase.id === "launch_subagents")
      ?.subagents?.find((item) => item.id === "sub-iberdrola");
    expect(iberdrola?.status).toBe("done");
  });

  it("starts a pending phase and its first tool", () => {
    const next = advanceAgentState(
      agentFrom([
        {
          id: "analyze",
          status: "pending",
          tools: [
            { id: "logs", name: "get_incident_logs", status: "pending" },
            { id: "deps", name: "analyze_dependencies", status: "pending" },
          ],
        },
      ]),
    );
    expect(next.phases[0].status).toBe("running");
    expect(next.phases[0].tools?.[0].status).toBe("running");
    expect(next.phases[0].tools?.[1].status).toBe("pending");
  });

  it("starts the next pending tool after completing the running one", () => {
    const next = advanceAgentState(
      agentFrom([
        {
          id: "analyze",
          status: "running",
          tools: [
            { id: "logs", name: "get_incident_logs", status: "running" },
            { id: "deps", name: "analyze_dependencies", status: "pending" },
          ],
        },
      ]),
    );
    expect(next.phases[0].tools?.[0].status).toBe("done");
    expect(next.phases[0].tools?.[0].time).toBeTruthy();
    expect(next.phases[0].tools?.[1].status).toBe("running");
  });

  it("completes a phase and starts the following pending phase in one step", () => {
    const next = advanceAgentState(
      agentFrom([
        { id: "analyze", status: "running" },
        { id: "plan", status: "pending" },
      ]),
    );
    expect(next.phases[0].status).toBe("done");
    expect(next.phases[1].status).toBe("running");
    expect(next.completed).toBe(1);
  });

  it("is a no-op when every phase is already done", () => {
    const agent = agentFrom([{ id: "close", status: "done", time: "10:40" }]);
    expect(advanceAgentState(agent)).toBe(agent);
  });
});

describe("appendFollowUp", () => {
  it("appends an operator message and an agent acknowledgement", () => {
    const snapshot = createInitialSnapshot();
    const next = appendFollowUp(snapshot.agent, "Prioriza Telefónica");
    const messages = next.activity.filter((item) => item.type === "message");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "operator",
      text: "Prioriza Telefónica",
    });
    expect(messages[1]).toMatchObject({
      role: "agent",
      textKey: "agent.followup.ack",
    });
    expect(snapshot.agent.activity).toHaveLength(7);
  });
});

describe("withAdvancedAgent", () => {
  it("returns the same snapshot when there is nothing to advance", () => {
    const snapshot = createInitialSnapshot();
    snapshot.agent.phases = snapshot.agent.phases.map((phase) => ({
      ...phase,
      status: "done",
      tools: phase.tools?.map((tool) => ({ ...tool, status: "done" })),
      subagents: phase.subagents?.map((subagent) => ({
        ...subagent,
        status: "done",
        tools: subagent.tools.map((tool) => ({ ...tool, status: "done" })),
      })),
    }));
    expect(withAdvancedAgent(snapshot)).toBe(snapshot);
  });

  it("never lowers the recovery percent", () => {
    const snapshot = createInitialSnapshot();
    snapshot.migrationOverallPercent = 90;
    const next = withAdvancedAgent(snapshot);
    expect(next.migrationOverallPercent).toBeGreaterThanOrEqual(90);
  });
});
