import { describe, expect, it } from "vitest";
import {
  approvalRemainderTitle,
  buildTranscript,
  completedReasoningLabel,
  crisisStartedAt,
  currentWork,
  formatElapsed,
  incidentClock,
  LIVE_REASONING_ID,
  mapToolState,
  collapseDiscarded,
  mergedToolCalls,
  reasoningDefaultOpen,
  recoveryTimeline,
  toolTitle,
} from "@/lib/agent-trace";
import type { TranscriptItem } from "@/lib/agent-trace";
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

function activity(partial: Partial<ActivityRecord> & Pick<ActivityRecord, "identifier" | "type">): ActivityRecord {
  return {
    sequence: 1,
    occurredAt: "2026-09-19T10:00:01.000Z",
    source: "agent",
    title: partial.type,
    summary: "",
    simulated: false,
    replayed: false,
    ...partial,
  };
}

describe("agent trace", () => {
  it("maps Casa Pepe tool statuses onto AI Elements states", () => {
    expect(mapToolState("pending")).toBe("input-streaming");
    expect(mapToolState("running")).toBe("input-available");
    expect(mapToolState("succeeded")).toBe("output-available");
    expect(mapToolState("failed")).toBe("output-error");
  });

  it("labels every tool in the selected language, including the delegation verbs", () => {
    expect(toolTitle({ name: "check_services_status", input: {} }, [], "es")).toBe(
      "Comprobando cada servicio por su cuenta",
    );
    expect(toolTitle({ name: "check_services_status", input: {} }, [], "en")).toBe(
      "Checking every service independently",
    );
    expect(
      toolTitle({ name: "delegate_investigation", input: {}, status: "succeeded" }, [], "en"),
    ).toBe("Asked the investigator for evidence");
    expect(
      toolTitle({ name: "call_engineer", input: { engineerName: "Guillermo" }, status: "succeeded" }, [], "en"),
    ).toBe("Called the on-call engineer: Guillermo");
  });

  it("falls back to the raw tool name when nothing is translated", () => {
    expect(toolTitle({ name: "brand_new_tool", input: {} }, [], "en")).toBe("brand new tool");
  });

  it("uses Spanish titles with the recovered service name", () => {
    expect(toolTitle({ name: "get_incident_context", input: {} })).toBe("Leyendo el contexto del incidente");
    expect(toolTitle({ name: "propose_plan", input: {} })).toBe("Redactando el plan");
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
    expect(currentWork(overview)).toMatchObject({ kind: "thinking", title: "Pensando" });
    expect(buildTranscript(overview).at(-1)).toMatchObject({
      kind: "thinking",
      id: LIVE_REASONING_ID,
      text: "",
      status: "streaming",
      title: "Pensando",
    });
  });

  it("concatenates public output fragments and prefers the completed payload text", () => {
    const overview = overviewWith([]);
    const events: ActivityRecord[] = [
      activity({
        identifier: "act_out_1",
        sequence: 1,
        occurredAt: "2026-09-19T10:00:01.000Z",
        type: "agent.llm-output",
        payload: { outputIdentifier: "out_1", provisional: true, text: "Reviso ", turn: 0 },
      }),
      activity({
        identifier: "act_out_2",
        sequence: 2,
        occurredAt: "2026-09-19T10:00:02.000Z",
        type: "agent.llm-output",
        payload: { outputIdentifier: "out_1", provisional: true, text: "capacidad.", turn: 0 },
      }),
      activity({
        identifier: "act_decision",
        sequence: 3,
        occurredAt: "2026-09-19T10:00:03.000Z",
        type: "agent.llm-decision",
        summary: "Reviso la capacidad confirmada antes de recuperar.",
        payload: {
          outputIdentifier: "out_1",
          turn: 0,
          text: "Reviso la capacidad confirmada antes de recuperar.",
          toolCalls: [{ id: "call_1", name: "get_recovery_capacity", arguments: {} }],
          model: "gpt-test",
          finishReason: "tool_calls",
          disposition: "accepted",
          redacted: false,
        },
      }),
    ];
    const items = buildTranscript(overview, events);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "thinking",
      id: "out_1",
      status: "complete",
      text: "Reviso la capacidad confirmada antes de recuperar.",
      durationMs: 2000,
      disposition: "accepted",
      model: "gpt-test",
      toolCalls: [{ id: "call_1", name: "get_recovery_capacity", arguments: {} }],
    });
    expect(completedReasoningLabel("Reviso la capacidad confirmada antes de recuperar.", 2000)).toBe(
      "Reviso la capacidad confirmada antes de recuperar. · 2s",
    );
  });

  it("keeps stale and failed turns labeled instead of dropping them", () => {
    const overview = overviewWith([]);
    overview.agent.cycleInProgress = true;
    const stale: ActivityRecord[] = [
      activity({
        identifier: "act_out_stale",
        sequence: 1,
        type: "agent.llm-output",
        payload: { outputIdentifier: "out_stale", provisional: true, text: "Borrador obsoleto", turn: 0 },
      }),
      activity({
        identifier: "act_stale",
        sequence: 2,
        occurredAt: "2026-09-19T10:00:02.000Z",
        type: "agent.llm-stale",
        payload: {
          outputIdentifier: "out_stale",
          turn: 0,
          text: "Borrador obsoleto",
          toolCalls: [],
          disposition: "stale",
          dispositionReason: "New evidence arrived; reassessing before taking action",
          redacted: false,
        },
      }),
    ];
    const staleThoughts = buildTranscript(overview, stale).filter((item) => item.kind === "thinking");
    expect(staleThoughts).toEqual([
      expect.objectContaining({
        id: "out_stale",
        status: "complete",
        text: "Borrador obsoleto",
        disposition: "stale",
        dispositionReason: "New evidence arrived; reassessing before taking action",
      }),
      expect.objectContaining({ id: LIVE_REASONING_ID, status: "streaming" }),
    ]);

    const failed: ActivityRecord[] = [
      activity({
        identifier: "act_out_fail",
        sequence: 1,
        type: "agent.llm-output",
        payload: { outputIdentifier: "out_fail", provisional: true, text: "Borrador fallido", turn: 0 },
      }),
      activity({
        identifier: "act_fail",
        sequence: 2,
        occurredAt: "2026-09-19T10:00:02.000Z",
        type: "agent.llm-failed",
        payload: {
          outputIdentifier: "out_fail",
          turn: 0,
          disposition: "incomplete",
          dispositionReason: "LLM unavailable",
        },
      }),
    ];
    expect(buildTranscript(overview, failed).filter((item) => item.kind === "thinking" && item.id === "out_fail")).toEqual([
      expect.objectContaining({
        id: "out_fail",
        disposition: "incomplete",
        dispositionReason: "LLM unavailable",
      }),
    ]);
  });

  it("creates a complete reasoning row from a decision-only event", () => {
    const overview = overviewWith([]);
    const items = buildTranscript(overview, [
      activity({
        identifier: "act_decision_only",
        sequence: 4,
        occurredAt: "2026-09-19T10:00:04.000Z",
        type: "agent.llm-decision",
        summary: "Voy a leer el contexto del incidente.",
        payload: { outputIdentifier: "out_only", turn: 0 },
      }),
    ]);
    expect(items[0]).toMatchObject({
      kind: "thinking",
      id: "out_only",
      status: "complete",
      text: "Voy a leer el contexto del incidente.",
      durationMs: 0,
    });
    expect(completedReasoningLabel("Voy a leer el contexto del incidente.", 0)).toBe(
      "Voy a leer el contexto del incidente. · <1s",
    );
  });

  it("places completed reasoning before the following tool and collapses it by default", () => {
    const overview = overviewWith([
      tool({ identifier: "t1", name: "get_incident_context", status: "succeeded", startedAt: "2026-09-19T10:00:05.000Z" }),
    ]);
    const items = buildTranscript(overview, [
      activity({
        identifier: "act_decision_tool",
        sequence: 3,
        occurredAt: "2026-09-19T10:00:03.000Z",
        type: "agent.llm-decision",
        summary: "Necesito el contexto actual.",
        payload: { outputIdentifier: "out_ctx", turn: 0, text: "Necesito el contexto actual.", disposition: "accepted" },
      }),
    ]);
    expect(items.map((item) => item.kind)).toEqual(["thinking", "tool"]);
    expect(items[0]).toMatchObject({ kind: "thinking", id: "out_ctx", status: "complete" });
    expect(reasoningDefaultOpen(items[0] as Extract<typeof items[0], { kind: "thinking" }>, items)).toBe(false);
    expect(reasoningDefaultOpen(items[0] as Extract<typeof items[0], { kind: "thinking" }>, [items[0]])).toBe(true);
  });

  it("keeps a live streaming row open and does not duplicate it when fragments are already flowing", () => {
    const overview = overviewWith([]);
    overview.agent.cycleInProgress = true;
    const items = buildTranscript(overview, [
      activity({
        identifier: "act_live",
        sequence: 1,
        type: "agent.llm-output",
        payload: { outputIdentifier: "out_live", provisional: true, text: "Compruebo servicios", turn: 0 },
      }),
    ]);
    expect(items.filter((item) => item.kind === "thinking")).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "thinking",
      id: "out_live",
      status: "streaming",
      text: "Compruebo servicios",
      title: "Pensando",
    });
    expect(reasoningDefaultOpen(items[0] as Extract<typeof items[0], { kind: "thinking" }>, items)).toBe(true);
  });

  it("keeps rejected and placeholder turns inspectable with their public payload", () => {
    const overview = overviewWith([]);
    overview.agent.cycleInProgress = true;
    const events: ActivityRecord[] = [
      activity({
        identifier: "act_d1",
        sequence: 1,
        type: "agent.llm-decision",
        summary: "Selecting the next investigation or action",
        payload: {
          outputIdentifier: "out_a",
          tools: ["propose_plan"],
          toolCalls: [{ id: "call_a", name: "propose_plan", arguments: { summary: "plan v1" } }],
          turn: 0,
          text: null,
          disposition: "pending",
          redacted: false,
        },
      }),
      activity({
        identifier: "act_r1",
        sequence: 2,
        occurredAt: "2026-09-19T10:00:02.000Z",
        type: "agent.llm-rejected",
        summary: "The proposed action did not pass runtime validation; the model must revise it.",
        payload: {
          outputIdentifier: "out_a",
          tool: "propose_plan",
          toolCalls: [{ id: "call_a", name: "propose_plan", arguments: { summary: "plan v1" } }],
          text: null,
          disposition: "rejected",
          dispositionReason: "Plan is missing a required recovery step",
          redacted: false,
        },
      }),
      activity({
        identifier: "act_d2",
        sequence: 3,
        occurredAt: "2026-09-19T10:00:03.000Z",
        type: "agent.llm-decision",
        summary: "Selecting the next investigation or action",
        payload: {
          outputIdentifier: "out_b",
          tools: ["propose_plan"],
          toolCalls: [{ id: "call_b", name: "propose_plan", arguments: { summary: "plan v2" } }],
          turn: 1,
          text: null,
          disposition: "pending",
          redacted: false,
        },
      }),
    ];
    expect(currentWork(overview, events)).toMatchObject({
      kind: "thinking",
      title: "Redactando el plan",
    });
    const thoughts = buildTranscript(overview, events).filter((item) => item.kind === "thinking");
    expect(thoughts.map((item) => item.kind === "thinking" ? {
      id: item.id,
      status: item.status,
      text: item.text,
      title: item.title,
      disposition: item.disposition,
    } : item)).toEqual([
      {
        id: "out_a",
        status: "complete",
        text: "Plan is missing a required recovery step",
        title: "Plan is missing a required recovery step",
        disposition: "rejected",
      },
      {
        id: "out_b",
        status: "streaming",
        text: "",
        title: "Redactando el plan",
        disposition: "pending",
      },
    ]);
  });

  it("replaces a pending decision with the accepted public turn", () => {
    const overview = overviewWith([]);
    const items = buildTranscript(overview, [
      activity({
        identifier: "act_pending",
        sequence: 1,
        type: "agent.llm-decision",
        summary: "Selecting the next investigation or action",
        payload: {
          outputIdentifier: "out_ok",
          text: "Voy a leer el contexto del incidente.",
          toolCalls: [{ id: "call_ctx", name: "get_incident_context", arguments: {} }],
          disposition: "pending",
          redacted: false,
        },
      }),
      activity({
        identifier: "act_accepted",
        sequence: 2,
        occurredAt: "2026-09-19T10:00:02.000Z",
        type: "agent.llm-decision",
        summary: "Voy a leer el contexto del incidente.",
        payload: {
          outputIdentifier: "out_ok",
          text: "Voy a leer el contexto del incidente.",
          toolCalls: [{ id: "call_ctx", name: "get_incident_context", arguments: {} }],
          disposition: "accepted",
          redacted: false,
        },
      }),
    ]);
    expect(items.filter((item) => item.kind === "thinking")).toEqual([
      expect.objectContaining({
        id: "out_ok",
        status: "complete",
        text: "Voy a leer el contexto del incidente.",
        disposition: "accepted",
        toolCalls: [{ id: "call_ctx", name: "get_incident_context", arguments: {} }],
      }),
    ]);
  });

  it("shows tool-only turns from proposed calls without inventing explanation text", () => {
    const overview = overviewWith([]);
    const items = buildTranscript(overview, [
      activity({
        identifier: "act_tools_only",
        sequence: 1,
        type: "agent.llm-decision",
        summary: "Selecting the next investigation or action",
        payload: {
          outputIdentifier: "out_tools",
          text: null,
          toolCalls: [{ id: "call_cap", name: "get_recovery_capacity", arguments: {} }],
          disposition: "accepted",
          redacted: false,
        },
      }),
    ]);
    expect(items[0]).toMatchObject({
      kind: "thinking",
      id: "out_tools",
      text: "",
      title: "Midiendo la capacidad de respaldo",
      disposition: "accepted",
      toolCalls: [{ id: "call_cap", name: "get_recovery_capacity", arguments: {} }],
    });
  });

  it("keeps placeholder turns after the cycle ends without inventing explanation text", () => {
    const overview = overviewWith([]);
    const events: ActivityRecord[] = [
      activity({
        identifier: "act_placeholder",
        sequence: 1,
        type: "agent.llm-decision",
        summary: "Selecting the next investigation or action",
        payload: { outputIdentifier: "out_done", tools: ["get_recovery_capacity"], turn: 0 },
      }),
      activity({
        identifier: "act_done",
        sequence: 2,
        occurredAt: "2026-09-19T10:00:02.000Z",
        type: "agent.cycle-finished",
      }),
    ];
    const items = buildTranscript(overview, events);
    expect(currentWork(overview, events)).toMatchObject({ kind: "idle", title: "En espera" });
    expect(items.filter((item) => item.kind === "thinking")).toEqual([
      expect.objectContaining({
        id: "out_done",
        status: "complete",
        text: "",
        title: "Midiendo la capacidad de respaldo",
      }),
    ]);
  });

  it("reports the run as resolved instead of a tool the activity stream left mid-flight", () => {
    const stale = tool({
      identifier: "call_recover",
      name: "execute_recovery",
      status: "running",
      input: { serviceIdentifier: "package-tracking" },
    });
    const overview = overviewWith([stale], [
      { identifier: "package-tracking", name: "Seguimiento de paquetes", status: "healthy", statusReason: "ok", lastChangedAt: "2026-09-19T10:05:00.000Z", recoveryCapacityUnits: 3 },
    ]);
    // The run is over as far as the server is concerned: recovered, no cycle, nothing running.
    overview.incident.status = "recovered";
    overview.agent.runningToolCalls = 0;

    expect(currentWork(overview)).toMatchObject({ kind: "settled", title: "Incidente resuelto" });
    expect(mergedToolCalls(overview).map((item) => item.status)).toEqual(["succeeded"]);
  });

  it("still surfaces a running tool while the run is live", () => {
    const running = tool({
      identifier: "call_recover",
      name: "execute_recovery",
      status: "running",
      input: { serviceIdentifier: "package-tracking" },
    });
    const overview = overviewWith([running]);
    expect(currentWork(overview)).toMatchObject({ kind: "tool", state: "input-available" });
    expect(mergedToolCalls(overview).map((item) => item.status)).toEqual(["running"]);
  });

  it("folds a run of discarded turns into one row and leaves the rest alone", () => {
    const thinking = (id: string, disposition?: "stale" | "rejected" | "accepted"): TranscriptItem => ({
      kind: "thinking",
      id,
      text: "",
      status: "complete",
      occurredAt: "2026-09-19T10:00:00.000Z",
      disposition,
    });
    const collapsed = collapseDiscarded([
      thinking("kept", "accepted"),
      thinking("stale-1", "stale"),
      thinking("stale-2", "stale"),
      thinking("rejected-1", "rejected"),
      thinking("after", "accepted"),
      thinking("lonely", "stale"),
    ]);
    expect(collapsed.map((item) => item.kind)).toEqual([
      "thinking",
      "discarded",
      "thinking",
      "thinking",
    ]);
    const group = collapsed[1];
    expect(group.kind === "discarded" && group.items.map((item) => item.id)).toEqual([
      "stale-1",
      "stale-2",
      "rejected-1",
    ]);
    // A single discard is cheaper to read inline than behind a disclosure.
    expect(collapsed[3]).toMatchObject({ kind: "thinking", id: "lonely" });
  });

  it("keeps thinking visible when the overview cycle flag flaps off mid-turn", () => {
    const overview = overviewWith([]);
    const events: ActivityRecord[] = [
      activity({
        identifier: "act_decision",
        sequence: 4,
        type: "agent.llm-decision",
        summary: "Selecting the next investigation or action",
        payload: { outputIdentifier: "out_live", tools: ["call_engineer"] },
      }),
      activity({
        identifier: "act_rejected",
        sequence: 5,
        occurredAt: "2026-09-19T10:00:02.000Z",
        type: "agent.llm-rejected",
        payload: { tool: "call_engineer" },
      }),
    ];
    expect(currentWork(overview, events)).toMatchObject({ kind: "thinking", title: "Pensando" });
    expect(buildTranscript(overview, events).at(-1)).toMatchObject({
      id: LIVE_REASONING_ID,
      status: "streaming",
      title: "Pensando",
    });
  });

  it("keeps only the completed work once the incident is settled", () => {
    const overview = overviewWith(
      [tool({ identifier: "t1", name: "execute_recovery", status: "succeeded", startedAt: "2026-09-19T10:00:01.000Z" })],
      [{ identifier: "orders-database", name: "Base de pedidos", status: "healthy", statusReason: "ok", lastChangedAt: "2026-09-19T10:01:00.000Z", recoveryCapacityUnits: 1 }],
    );
    const settled = {
      ...overview,
      incident: { ...overview.incident, status: "recovered", resolvedAt: "2026-09-19T10:02:00.000Z" },
    } as Overview;
    const events = [
      activity({
        identifier: "act-1",
        occurredAt: "2026-09-19T10:00:30.000Z",
        payload: { disposition: "accepted", text: "Reviewing the capacity" },
        type: "agent.llm-decision",
      }),
    ];

    expect(buildTranscript(overview, events).some((item) => item.kind === "thinking")).toBe(true);
    expect(buildTranscript(settled, events).every((item) => item.kind !== "thinking")).toBe(true);
    expect(buildTranscript(settled, events).map((item) => item.kind)).toEqual(["tool"]);
  });
});
