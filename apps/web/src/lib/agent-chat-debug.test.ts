import { describe, expect, it } from "vitest";
import { formatChatDebugDump } from "@/lib/agent-chat-debug";
import type { ActivityRecord, Overview, Plan, ToolCall } from "@/lib/casa-pepe-types";

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

function overviewWith(partial: Partial<Overview> = {}): Overview {
  return {
    incident: {
      runIdentifier: "run_1",
      title: "Crisis",
      company: "Casa Pepe",
      narrative: "",
      region: "eu-central-1",
      backupRegion: "me-central-1",
      status: "active",
      active: true,
      startedAt: "2026-09-19T09:58:00.000Z",
      impactedAt: "2026-09-19T10:00:00.000Z",
      resolvedAt: "",
      businessImpactSummary: "",
      services: [
        {
          identifier: "events-stream",
          name: "Flujo de eventos",
          description: "",
          status: "recovering",
          statusReason: "migrando",
          businessImpact: "high",
          impactDescription: "",
          dependencies: [],
          recoveryCapacityUnits: 2,
          recoveryRequiresApproval: false,
          lastChangedAt: "2026-09-19T10:00:04.000Z",
        },
      ],
      topology: { nodes: [], links: [] },
      customers: [],
      resources: [],
      facts: [],
    },
    plan: { kind: "none" },
    pendingApprovals: [],
    tasks: [],
    engineerCalls: [],
    toolCalls: [],
    recentActivity: [],
    agent: {
      cycleInProgress: false,
      cycles: 2,
      maximumCycles: 12,
      planVersion: 1,
      pendingApprovals: 0,
      runningToolCalls: 0,
      lastCycleOutcome: null,
    },
    ...partial,
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

const plan: Plan = {
  identifier: "plan_1",
  version: 1,
  status: "active",
  summary: "Recuperar Flujo de eventos",
  reason: "impacto crítico",
  capacity: {
    resourceIdentifier: "engineers",
    totalCapacity: 5,
    assumedCapacity: 5,
    plannedUnits: 2,
    remainingUnits: 3,
    postponedUnits: 0,
    confirmed: true,
  },
  assumptions: ["La réplica de Valencia está sana"],
  changesFromPrevious: [{ kind: "priority", description: "Sube Flujo de eventos", serviceIdentifier: "events-stream" }],
  priorities: [
    {
      serviceIdentifier: "events-stream",
      serviceName: "Flujo de eventos",
      rank: 1,
      score: 9,
      businessImpact: "high",
      capacityUnits: 2,
      decision: "recover-now",
      reason: "clientes críticos",
      blockedBy: [],
    },
  ],
  steps: [
    {
      identifier: "stp_prepare",
      order: 1,
      title: "Preparar la recuperación",
      reason: "hace falta contexto",
      owner: { kind: "agent", name: "Casa Pepe agent" },
      serviceIdentifier: "events-stream",
      capacityUnits: 2,
      requiresApproval: false,
      status: "completed",
      statusReason: "listo",
      resultSummary: "contexto leído",
      attempts: 1,
      updatedAt: "2026-09-19T10:00:06.000Z",
      invocation: { name: "get_incident_context", input: { verbose: true } },
    },
    {
      identifier: "stp_execute",
      order: 2,
      title: "Ejecutar la recuperación",
      reason: "prioridad 1",
      owner: { kind: "agent", name: "Casa Pepe agent" },
      serviceIdentifier: "events-stream",
      capacityUnits: 2,
      requiresApproval: true,
      status: "running",
      statusReason: "",
      resultSummary: "",
      attempts: 1,
      updatedAt: "2026-09-19T10:00:08.000Z",
    },
  ],
};

describe("formatChatDebugDump", () => {
  it("includes collapsed reasoning, nested tools, plan details and pending approvals as if expanded", () => {
    const overview = overviewWith({
      plan: { kind: "plan", plan },
      pendingApprovals: [
        {
          identifier: "appr_1",
          serviceIdentifier: "events-stream",
          actionSummary: "recuperar Flujo de eventos",
          reason: "capacidad limitada",
          consequences: ["corta el servicio primario"],
          capacityUnits: 2,
          status: "pending",
          requestedAt: "2026-09-19T10:00:07.000Z",
          expiresAt: "2026-09-19T10:10:07.000Z",
        },
      ],
      toolCalls: [
        tool({
          identifier: "t1",
          name: "get_incident_context",
          status: "succeeded",
          startedAt: "2026-09-19T10:00:01.000Z",
          finishedAt: "2026-09-19T10:00:02.000Z",
          input: { verbose: true },
          output: { kind: "incident-context", hidden: "full payload" },
        }),
        tool({
          identifier: "t2",
          name: "execute_recovery",
          status: "running",
          startedAt: "2026-09-19T10:00:05.000Z",
          input: { serviceIdentifier: "events-stream", mode: "failover" },
          parentIdentifier: "explore-1",
          subagent: { id: "explore-1", name: "Explore · blast radius", status: "in_progress" },
        }),
      ],
      agent: {
        cycleInProgress: false,
        cycles: 3,
        maximumCycles: 12,
        planVersion: 1,
        pendingApprovals: 1,
        runningToolCalls: 1,
        lastCycleOutcome: null,
        model: "gpt-test",
      },
    });
    const events: ActivityRecord[] = [
      activity({
        identifier: "act_decision",
        sequence: 3,
        occurredAt: "2026-09-19T10:00:03.000Z",
        type: "agent.llm-decision",
        summary: "Necesito el contexto actual del incidente.",
        payload: {
          outputIdentifier: "out_1",
          turn: 0,
          text: "Necesito el contexto actual del incidente.\nVoy a leer logs internos.",
          toolCalls: [{ id: "call_1", name: "get_incident_context", arguments: { verbose: true, region: "eu-central-1" } }],
          model: "gpt-test",
          finishReason: "tool_calls",
          disposition: "accepted",
          usage: { totalTokens: 412 },
        },
      }),
    ];

    const dump = formatChatDebugDump(overview, events);

    expect(dump.startsWith("DEBUG · Pepe chat (fully expanded)")).toBe(true);
    expect(dump).toContain("model gpt-test");
    expect(dump).toContain("PENDING APPROVALS");
    expect(dump).toContain("recuperar Flujo de eventos");
    expect(dump).toContain("capacidad limitada");
    expect(dump).toContain("corta el servicio primario");
    expect(dump).toContain("PLAN v1 (active)");
    expect(dump).toContain("Recuperar Flujo de eventos");
    expect(dump).toContain("La réplica de Valencia está sana");
    expect(dump).toContain("Sube Flujo de eventos");
    expect(dump).toContain("clientes críticos");
    expect(dump).toContain("[completed] Preparar la recuperación");
    expect(dump).toContain("reason: hace falta contexto");
    expect(dump).toContain("result: contexto leído");
    expect(dump).toContain('"verbose": true');
    expect(dump).toContain("requiresApproval: true");
    expect(dump).toContain("TRANSCRIPT (all collapsed sections expanded)");
    expect(dump).toContain("Voy a leer logs internos.");
    expect(dump).toContain('"region": "eu-central-1"');
    expect(dump).toContain("412 tokens");
    expect(dump).toContain('"hidden": "full payload"');
    expect(dump).toContain("[task] Explore · blast radius · in_progress");
    expect(dump).toContain('"mode": "failover"');
    expect(dump).toContain("Recuperando Flujo de eventos");
  });

  it("keeps decided approvals and failed tool errors in the dump", () => {
    const overview = overviewWith({
      toolCalls: [
        tool({
          identifier: "t1",
          name: "call_engineer",
          status: "failed",
          input: { engineerName: "Marta Ruiz" },
          error: { message: "no answer", code: "timeout" },
        }),
      ],
    });
    const events: ActivityRecord[] = [
      activity({
        identifier: "act_approval",
        sequence: 8,
        occurredAt: "2026-09-19T10:00:08.000Z",
        type: "approval.decided",
        source: "operator",
        payload: {
          approval: {
            identifier: "appr_1",
            actionSummary: "ejecutar recuperación",
            status: "approved",
            decidedAt: "2026-09-19T10:00:08.000Z",
            decidedBy: "operator",
          },
        },
      }),
    ];

    const dump = formatChatDebugDump(overview, events);
    expect(dump).toContain("Aprobó ejecutar recuperación");
    expect(dump).toContain("decidedBy: operator");
    expect(dump).toContain("Error: no answer");
    expect(dump).toContain("errorCode: timeout");
    expect(dump).toContain("Llamó al ingeniero de guardia: Marta Ruiz");
  });
});
