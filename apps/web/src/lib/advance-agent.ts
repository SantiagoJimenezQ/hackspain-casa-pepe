import type {
  AgentPhase,
  AgentState,
  AgentSubagent,
  AgentToolCall,
  DashboardSnapshot,
} from "@/lib/dashboard-types";

function stampTime() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function cloneTools(tools: AgentToolCall[] = []) {
  return tools.map((tool) => ({ ...tool }));
}

function cloneSubagents(subagents: AgentSubagent[] = []) {
  return subagents.map((subagent) => ({
    ...subagent,
    tools: cloneTools(subagent.tools),
  }));
}

function clonePhases(phases: AgentPhase[]): AgentPhase[] {
  return phases.map((phase): AgentPhase => ({
    ...phase,
    tools: phase.tools ? cloneTools(phase.tools) : undefined,
    subagents: phase.subagents ? cloneSubagents(phase.subagents) : undefined,
  }));
}

function completeTool(tool: AgentToolCall): AgentToolCall {
  return {
    ...tool,
    status: "done",
    time: tool.time ?? stampTime(),
  };
}

function startFirstPendingTool(tools: AgentToolCall[]) {
  const pending = tools.findIndex((tool) => tool.status === "pending");
  if (pending >= 0) {
    tools[pending] = { ...tools[pending], status: "running" };
  }
}

function advanceTools(tools: AgentToolCall[]): boolean {
  const running = tools.findIndex((tool) => tool.status === "running");
  if (running >= 0) {
    tools[running] = completeTool(tools[running]);
    startFirstPendingTool(tools);
    return true;
  }
  const pending = tools.findIndex((tool) => tool.status === "pending");
  if (pending >= 0) {
    tools[pending] = { ...tools[pending], status: "running" };
    return true;
  }
  return false;
}

function startSubagent(subagent: AgentSubagent): AgentSubagent {
  const tools = cloneTools(subagent.tools);
  startFirstPendingTool(tools);
  if (!tools.some((tool) => tool.status === "running") && tools[0]) {
    tools[0] = { ...tools[0], status: "running" };
  }
  return { ...subagent, status: "running", tools };
}

function advanceSubagent(subagent: AgentSubagent): { subagent: AgentSubagent; changed: boolean } {
  if (subagent.status === "pending") {
    return { subagent: startSubagent(subagent), changed: true };
  }
  if (subagent.status === "done") {
    return { subagent, changed: false };
  }

  const tools = cloneTools(subagent.tools);
  if (advanceTools(tools)) {
    return { subagent: { ...subagent, tools }, changed: true };
  }

  return {
    subagent: { ...subagent, status: "done", tools },
    changed: true,
  };
}

function startPhase(phase: AgentPhase): AgentPhase {
  const next: AgentPhase = { ...phase, status: "running", time: phase.time ?? stampTime() };
  if (next.tools?.length) {
    const tools = cloneTools(next.tools);
    startFirstPendingTool(tools);
    return { ...next, tools };
  }
  if (next.subagents?.length) {
    const subagents = cloneSubagents(next.subagents);
    const pending = subagents.findIndex((item) => item.status === "pending");
    if (pending >= 0) {
      subagents[pending] = startSubagent(subagents[pending]);
    }
    return { ...next, subagents };
  }
  return next;
}

function advancePhase(phase: AgentPhase): { phase: AgentPhase; changed: boolean } {
  if (phase.status === "pending") {
    return { phase: startPhase(phase), changed: true };
  }
  if (phase.status === "done") {
    return { phase, changed: false };
  }

  if (phase.tools?.length) {
    const tools = cloneTools(phase.tools);
    if (advanceTools(tools)) {
      return { phase: { ...phase, tools }, changed: true };
    }
  }

  if (phase.subagents?.length) {
    const subagents = cloneSubagents(phase.subagents);
    const running = subagents.findIndex((item) => item.status === "running");
    if (running >= 0) {
      const advanced = advanceSubagent(subagents[running]);
      subagents[running] = advanced.subagent;
      if (advanced.subagent.status === "done") {
        const pending = subagents.findIndex((item) => item.status === "pending");
        if (pending >= 0) {
          subagents[pending] = startSubagent(subagents[pending]);
        }
      }
      return { phase: { ...phase, subagents }, changed: true };
    }

    const pending = subagents.findIndex((item) => item.status === "pending");
    if (pending >= 0) {
      subagents[pending] = startSubagent(subagents[pending]);
      return { phase: { ...phase, subagents }, changed: true };
    }
  }

  return {
    phase: { ...phase, status: "done", time: phase.time ?? stampTime() },
    changed: true,
  };
}

export function advanceAgentState(agent: AgentState): AgentState {
  const phases = clonePhases(agent.phases);
  let changed = false;

  for (let index = 0; index < phases.length; index += 1) {
    const result = advancePhase(phases[index]);
    if (result.changed) {
      phases[index] = result.phase;
      if (result.phase.status === "done") {
        const nextPending = phases.findIndex((phase) => phase.status === "pending");
        if (nextPending >= 0) {
          phases[nextPending] = startPhase(phases[nextPending]);
        }
      }
      changed = true;
      break;
    }
  }

  if (!changed) return agent;

  const completed = phases.filter((phase) => phase.status === "done").length;
  return {
    ...agent,
    phases,
    completed: Math.min(completed, agent.total),
  };
}

export function appendFollowUp(
  agent: AgentState,
  text: string,
): AgentState {
  const time = stampTime();
  return {
    ...agent,
    activity: [
      ...agent.activity,
      {
        id: `msg-op-${crypto.randomUUID()}`,
        type: "message",
        role: "operator",
        text,
        time,
      },
      {
        id: `msg-ag-${crypto.randomUUID()}`,
        type: "message",
        role: "agent",
        textKey: "agent.followup.ack",
        time,
      },
    ],
  };
}

export function withAdvancedAgent(
  snapshot: DashboardSnapshot,
): DashboardSnapshot {
  const agent = advanceAgentState(snapshot.agent);
  if (agent === snapshot.agent) return snapshot;
  const completed = agent.phases.filter((phase) => phase.status === "done").length;
  const percent = Math.round((completed / agent.phases.length) * 100);
  return {
    ...snapshot,
    agent,
    migrationOverallPercent: Math.max(snapshot.migrationOverallPercent, percent),
  };
}
