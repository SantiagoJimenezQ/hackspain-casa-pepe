import { describe, expect, it } from "vitest";
import {
  approvalRemainderTitle,
  buildTranscript,
  crisisStartedAt,
  currentWork,
  formatElapsed,
  incidentClock,
  mapToolState,
  mergedToolCalls,
  recoveryTimeline,
  toolTitle,
} from "@/lib/agent-trace";
import type { ActivityRecord, Overview, ToolCall } from "@/lib/casa-pepe-types";

function tool(partial: Partial<ToolCall> & Pick<ToolCall, "identifier" | "name" | "status">): ToolCall {
  return {
    interaction: "test-environment",
    simulated: true,
    error: null,
    startedAt: "2026-09-19T10:00:00.000Z",
    finishedAt: "",
    input: {},
    output: null,
    ...partial,
  };
}

function overviewWith(tools: ToolCall[], services = [
  { identifier: "events-stream", name: "Flujo de eventos", status: "recovering", statusReason: "migrando", lastChangedAt: "2026-09-19T10:00:04.000Z", recoveryCapacityUnits: 2 },
  { identifier: "package-tracking", name: "Seguimiento de paquetes", status: "down", statusReason: "caído", lastChangedAt: "2026-09-19T10:00:00.000Z", recoveryCapacityUnits: 3 },
  { identifier: "orders-database", name: "Base de pedidos", status: "healthy", statusReason: "ok", lastChangedAt: "2026-09-19T09:59:00.000Z", recoveryCapacityUnits: 1 },
]): Overview {
  return {
    incident: {
      runIdentifier: "run_1",
      title: "Crisis",
      company: "Casa Pepe",
      narrative: "",
      region: "me-south-1",
      backupRegion: "me-central-1",
      status: "active",
      active: true,
      startedAt: "2026-09-19T09:58:00.000Z",
      impactedAt: "2026-09-19T10:00:00.000Z",
      resolvedAt: "",
      businessImpactSummary: "",
      services: services.map((service) => ({
        description: "",
        businessImpact: "high",
        impactDescription: "",
        dependencies: [],
        recoveryRequiresApproval: false,
        ...service,
      })),
      topology: { nodes: [], links: [] },
      customers: [],
      resources: [],
      facts: [],
    },
    plan: { kind: "none" },
    pendingApprovals: [],
    tasks: [],
    engineerCalls: [],
    toolCalls: tools,
    recentActivity: [],
    agent: {
      cycleInProgress: false,
      cycles: 2,
      maximumCycles: 12,
      planVersion: 1,
      pendingApprovals: 0,
      runningToolCalls: tools.filter((item) => item.status === "running").length,
      lastCycleOutcome: null,
    },
  } as Overview;
}

describe("agent trace", () => {
  it("maps Casa Pepe tool statuses onto AI Elements states", () => {
    expect(mapToolState("pending")).toBe("input-streaming");
    expect(mapToolState("running")).toBe("input-available");
    expect(mapToolState("succeeded")).toBe("output-available");
    expect(mapToolState("failed")).toBe("output-error");
  });

  it("uses Spanish titles with the recovered service name", () => {
    expect(toolTitle({ name: "get_incident_context", input: {} })).toBe("Leyendo contexto del incidente");
    expect(toolTitle(
      { name: "execute_recovery", input: { serviceIdentifier: "package-tracking" } },
      [{ identifier: "package-tracking", name: "Seguimiento de paquetes" } as Overview["incident"]["services"][number]],
    )).toBe("Recuperando Seguimiento de paquetes");
  });

  it("selects the running tool as current work", () => {
    const overview = overviewWith([
      tool({ identifier: "t1", name: "get_incident_context", status: "succeeded", startedAt: "2026-09-19T10:00:01.000Z" }),
      tool({ identifier: "t2", name: "execute_recovery", status: "running", startedAt: "2026-09-19T10:00:05.000Z", input: { serviceIdentifier: "events-stream" } }),
    ]);
    expect(currentWork(overview)).toMatchObject({ kind: "tool", title: "Recuperando Flujo de eventos", state: "input-available" });
  });

  it("merges a live tool-call payload before the overview refresh arrives", () => {
    const overview = overviewWith([]);
    const tools = mergedToolCalls(overview, [{
      identifier: "act_1",
      sequence: 4,
      occurredAt: "2026-09-19T10:00:06.000Z",
      type: "tool-call.started",
      source: "tools",
      title: "execute_recovery",
      summary: "",
      simulated: true,
      replayed: false,
      payload: { toolCall: { identifier: "t9", name: "verify_recovery", status: "running", startedAt: "2026-09-19T10:00:06.000Z", input: { serviceIdentifier: "events-stream" } } },
    }]);
    expect(tools[0]).toMatchObject({ identifier: "t9", status: "running", name: "verify_recovery" });
  });

  it("keeps recovery services in incident order while phases update", () => {
    const overview = overviewWith([
      tool({ identifier: "t1", name: "execute_recovery", status: "succeeded", startedAt: "2026-09-19T10:00:02.000Z", input: { serviceIdentifier: "orders-database" } }),
      tool({ identifier: "t2", name: "execute_recovery", status: "running", startedAt: "2026-09-19T10:00:08.000Z", input: { serviceIdentifier: "events-stream" } }),
    ]);
    const items = recoveryTimeline(overview);
    expect(items.map((item) => item.identifier)).toEqual([
      "events-stream",
      "package-tracking",
      "orders-database",
    ]);
    expect(items.map((item) => item.phase)).toEqual([
      "recovering",
      "offline",
      "recovered",
    ]);
  });

  it("hides the recovery timeline until impact", () => {
    const overview = overviewWith([]);
    overview.incident.impactedAt = "";
    expect(recoveryTimeline(overview)).toEqual([]);
  });

  it("formats the crisis clock from impact time", () => {
    const overview = overviewWith([]);
    expect(crisisStartedAt(overview.incident)).toBe("2026-09-19T10:00:00.000Z");
    expect(formatElapsed(overview.incident.impactedAt, Date.parse("2026-09-19T10:01:05.000Z"))).toBe("01:05");
    expect(formatElapsed(overview.incident.impactedAt, Date.parse("2026-09-19T11:02:03.000Z"))).toBe("1:02:03");
  });

  it("keeps the incident clock at zero until impact", () => {
    const overview = overviewWith([]);
    overview.incident.impactedAt = "";
    expect(incidentClock(overview.incident, Date.parse("2026-09-19T10:05:00.000Z"))).toEqual({
      elapsed: "00:00",
      recovered: false,
      running: false,
    });
  });

  it("keeps the incident clock running during partial recovery", () => {
    const overview = overviewWith([]);
    overview.incident.status = "partially-recovered";
    expect(incidentClock(overview.incident, Date.parse("2026-09-19T10:00:45.000Z"))).toEqual({
      elapsed: "00:45",
      recovered: false,
      running: true,
    });
  });

  it("freezes the incident clock at resolution even as wall time moves", () => {
    const overview = overviewWith([]);
    overview.incident.status = "recovered";
    overview.incident.resolvedAt = "2026-09-19T10:01:23.000Z";
    const later = Date.parse("2026-09-19T12:00:00.000Z");
    expect(incidentClock(overview.incident, later)).toEqual({
      elapsed: "01:23",
      recovered: true,
      running: false,
    });
    expect(incidentClock(overview.incident, later + 60_000).elapsed).toBe("01:23");
  });

  it("switches tool titles to past tense when the call has finished", () => {
    expect(toolTitle({ name: "get_incident_context", input: {}, status: "succeeded" })).toBe("Leyó el contexto del incidente");
    expect(toolTitle(
      { name: "execute_recovery", input: { serviceIdentifier: "package-tracking" }, status: "failed" },
      [{ identifier: "package-tracking", name: "Seguimiento de paquetes" } as Overview["incident"]["services"][number]],
    )).toBe("Recuperó Seguimiento de paquetes");
  });

  it("treats a finished cycle as idle instead of repeating the last tool", () => {
    const overview = overviewWith([
      tool({ identifier: "t1", name: "get_incident_context", status: "succeeded" }),
    ]);
    expect(currentWork(overview)).toMatchObject({ kind: "idle", title: "En espera" });
  });

  it("builds a flat transcript of tool rows when there are no subagents", () => {
    const overview = overviewWith([
      tool({ identifier: "t1", name: "get_incident_context", status: "succeeded", startedAt: "2026-09-19T10:00:01.000Z" }),
      tool({ identifier: "t2", name: "get_recovery_capacity", status: "succeeded", startedAt: "2026-09-19T10:00:02.000Z" }),
    ]);
    expect(buildTranscript(overview).map((item) => item.kind)).toEqual(["tool", "tool"]);
  });

  it("nests tools under a task when parentIdentifier is present", () => {
    const overview = overviewWith([
      tool({ identifier: "t1", name: "get_incident_context", status: "succeeded", startedAt: "2026-09-19T10:00:01.000Z" }),
      tool({
        identifier: "t2",
        name: "execute_recovery",
        status: "running",
        startedAt: "2026-09-19T10:00:05.000Z",
        input: { serviceIdentifier: "events-stream" },
        parentIdentifier: "explore-1",
        subagent: { id: "explore-1", name: "Explore · blast radius", status: "in_progress" },
      }),
      tool({
        identifier: "t3",
        name: "verify_recovery",
        status: "pending",
        startedAt: "2026-09-19T10:00:06.000Z",
        input: { serviceIdentifier: "events-stream" },
        parentIdentifier: "explore-1",
        subagent: { id: "explore-1", name: "Explore · blast radius", status: "in_progress" },
      }),
    ]);
    const items = buildTranscript(overview);
    expect(items.map((item) => item.kind)).toEqual(["tool", "task"]);
    const task = items[1];
    expect(task).toMatchObject({ kind: "task", id: "explore-1", title: "Explore · blast radius", status: "in_progress" });
    expect(task.kind === "task" ? task.children.map((child) => child.kind) : []).toEqual(["tool", "tool"]);
  });

  it("appends decided approvals as remainder rows", () => {
    const overview = overviewWith([
      tool({ identifier: "t1", name: "request_approval", status: "succeeded", startedAt: "2026-09-19T10:00:01.000Z" }),
    ]);
    const activity: ActivityRecord[] = [{
      identifier: "act_approval",
      sequence: 8,
      occurredAt: "2026-09-19T10:00:08.000Z",
      type: "approval.decided",
      source: "operator",
      title: "Approval approved",
      summary: "",
      simulated: false,
      replayed: false,
      payload: {
        approval: {
          identifier: "appr_1",
          actionSummary: "ejecutar recuperación",
          status: "approved",
          decidedAt: "2026-09-19T10:00:08.000Z",
        },
      },
    }];
    const items = buildTranscript(overview, activity);
    expect(items.map((item) => item.kind)).toEqual(["tool", "approval"]);
    expect(items[1]).toMatchObject({ kind: "approval", approval: { identifier: "appr_1", decision: "approved" } });
    expect(approvalRemainderTitle({ decision: "approved", actionSummary: "ejecutar recuperación" })).toBe("Aprobó ejecutar recuperación");
    expect(approvalRemainderTitle({ decision: "rejected", actionSummary: "ejecutar recuperación" })).toBe("Rechazó ejecutar recuperación");
  });

  it("adds a thinking row while a cycle is in progress and no tool is running", () => {
    const overview = overviewWith([]);
    overview.agent.cycleInProgress = true;
    expect(currentWork(overview)).toMatchObject({ kind: "thinking", title: "Preparando el siguiente paso" });
    expect(buildTranscript(overview).at(-1)).toEqual({ kind: "thinking" });
  });
});
