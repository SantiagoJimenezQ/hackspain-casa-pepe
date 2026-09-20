import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { TopBar } from "@/components/dashboard/top-bar";
import { LiveOperationsDashboard } from "@/components/dashboard/live-operations-dashboard";
import { casaPepeClient } from "@/lib/casa-pepe-client";
import { renderWithProviders } from "@/test/render";
import { MockEventSource } from "@/test/setup";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function isOverview(url: string) {
  return url.includes("/overview");
}

function isLlmHistory(url: string) {
  return url.includes("/activity/llm");
}

function Probe() {
  const { status, error, startDemo, busyAction } = useDashboard();
  return (
    <>
      <p>{status}</p>
      <p>{busyAction ?? "idle"}</p>
      {error ? <p>{error}</p> : null}
      <button type="button" onClick={() => void startDemo()}>start</button>
    </>
  );
}

function ResetProbe() {
  const { resetDemo } = useDashboard();
  return <button onClick={() => void resetDemo()}>reset</button>;
}

const snapshot = {
  incident: {
    runIdentifier: "run_1",
    title: "Crisis Baréin",
    company: "Casa Pepe",
    narrative: "",
    region: "eu-central-1",
    backupRegion: "me-central-1",
    status: "active",
    active: true,
    startedAt: "2026-09-19T10:00:00.000Z",
    impactedAt: "2026-09-19T10:00:02.000Z",
    resolvedAt: "",
    businessImpactSummary: "Impacto",
    services: [
      {
        identifier: "events-stream",
        name: "Flujo de eventos",
        description: "",
        status: "recovering",
        statusReason: "migrando",
        businessImpact: "critical",
        impactDescription: "",
        dependencies: [],
        recoveryCapacityUnits: 2,
        recoveryRequiresApproval: false,
        lastChangedAt: "2026-09-19T10:00:08.000Z",
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
  toolCalls: [
    {
      identifier: "t0",
      name: "get_incident_context",
      interaction: "test-environment",
      status: "succeeded",
      simulated: true,
      error: null,
      startedAt: "2026-09-19T10:00:03.000Z",
      finishedAt: "2026-09-19T10:00:04.000Z",
      input: {},
      output: { kind: "incident-context" },
    },
    {
      identifier: "t1",
      name: "execute_recovery",
      interaction: "test-environment",
      status: "running",
      simulated: true,
      error: null,
      startedAt: "2026-09-19T10:00:08.000Z",
      finishedAt: "",
      input: { serviceIdentifier: "events-stream" },
      output: null,
    },
  ],
  recentActivity: [],
  agent: {
    cycleInProgress: false,
    cycles: 1,
    maximumCycles: 12,
    planVersion: 1,
    pendingApprovals: 0,
    runningToolCalls: 1,
    lastCycleOutcome: null,
  },
};

const idleSnapshot = {
  ...snapshot,
  incident: {
    ...snapshot.incident,
    status: "normal",
    impactedAt: "",
    resolvedAt: "",
    services: snapshot.incident.services.map((service) => ({
      ...service,
      status: "healthy",
      statusReason: "ok",
    })),
  },
  toolCalls: [],
  agent: {
    ...snapshot.agent,
    cycles: 0,
    runningToolCalls: 0,
    lastCycleOutcome: null,
  },
};

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener() {}
  removeEventListener() {}
  close() {}
}

describe("live dashboard provider", () => {
  afterEach(() => {
    FakeEventSource.instances = [];
    casaPepeClient.forgetRun();
    vi.stubGlobal("EventSource", MockEventSource);
    vi.restoreAllMocks();
  });

  it.each([true, false])("resets saved learning with truthful feedback (success=%s)", async (succeeds) => {
    let removed = false;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/overview")) return Response.json(idleSnapshot);
      if (url.endsWith("/learning/insights") && init?.method === "DELETE") {
        if (!succeeds) return Response.json({ message: "No se pudieron borrar los aprendizajes" }, { status: 500 });
        removed = true;
        return Response.json({ removed: 2 });
      }
      if (url.endsWith("/learning/insights")) return Response.json(removed ? [] : [{ identifier: "lesson-1" }]);
      return Response.json({ lessons: removed ? [] : ["Previous capacity shortfall"] });
    });
    function LearningProbe() {
      const { insights, error } = useDashboard();
      return <><p>Lessons: {insights.length}</p>{error ? <p>{error}</p> : null}</>;
    }
    const { user } = renderWithProviders(<><TopBar /><LearningProbe /></>);
    await screen.findByText("Lessons: 1");
    // The action lives inside the learnings panel now, not in the navbar.
    await user.click(screen.getByText("Aprendizajes"));
    await user.click(await screen.findByRole("button", { name: "Borrar todos los aprendizajes" }));
    if (succeeds) {
      await screen.findByText("Lessons: 0");
      expect(screen.getByRole("status")).toHaveTextContent("2 aprendizajes borrados");
    } else {
      await screen.findByText("No se pudieron borrar los aprendizajes");
      expect(screen.getByText("Lessons: 1")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/demo/reset"))).toBe(false);
    // Emptying the memory leaves nothing to delete, so the button only comes back when it failed.
    await waitFor(() =>
      succeeds
        ? expect(screen.getByRole("button", { name: "Borrar todos los aprendizajes" })).toBeDisabled()
        : expect(screen.getByRole("button", { name: "Borrar todos los aprendizajes" })).toBeEnabled(),
    );
  });

  it("shows saved lessons, refreshes them, and distinguishes errors from empty memory", async () => {
    let mode = "saved";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/activity/llm?")) return Response.json({ items: [], nextBeforeSequence: null });
      if (url.includes("/overview")) return Response.json(idleSnapshot);
      if (url.endsWith("/learning/insights")) {
        if (mode === "error") return Response.json({ message: "Unavailable" }, { status: 503 });
        return Response.json(mode === "empty" ? [] : [{ identifier: "lesson-1", kind: "capacity-overstated", subject: "backup-region", summary: "Only 7 of 12 units were available", observations: 3, updatedAt: "2026-09-20T10:00:00Z" }]);
      }
      return Response.json({ lessons: [] });
    });
    const { user } = renderWithProviders(<TopBar />);
    await user.click(screen.getByText("Aprendizajes"));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Aprendizajes del agente");
    expect(await screen.findByText("Only 7 of 12 units were available")).toBeVisible();
    expect(screen.getByText("3 observaciones")).toBeVisible();
    expect(screen.getByText("Capacidad sobreestimada")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualizar" })).toBeEnabled());
    mode = "error";
    await user.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los aprendizajes");
    expect(screen.queryByText(/Todavía no hay aprendizajes/)).not.toBeInTheDocument();
    expect(screen.getByText("Only 7 of 12 units were available")).toBeVisible();
    mode = "empty";
    await user.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(await screen.findByText(/Todavía no hay aprendizajes/)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("boots an idle run when the backend has no active scenario", async () => {
    let started = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        if (!started) {
          return new Response(
            JSON.stringify({
              message: "There is no active incident run. Start one through the demo controls first",
            }),
            { status: 409 },
          );
        }
        return new Response(JSON.stringify(idleSnapshot), { status: 200 });
      }
      if (url.includes("/demo/start")) {
        started = true;
        return new Response("{}", { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(<Probe />);

    await waitFor(() => expect(screen.getByText("active")).toBeInTheDocument());
    expect(screen.queryByText(/No active run/)).not.toBeInTheDocument();
  });

  it("starts the scenario without firing impact or fetching learning on every refresh", async () => {
    const calls: string[] = [];
    let started = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (isOverview(url)) {
        if (!started) {
          return new Response(JSON.stringify({ message: "no run" }), { status: 409 });
        }
        return new Response(JSON.stringify(idleSnapshot), { status: 200 });
      }
      if (url.includes("/demo/start")) {
        started = true;
        return new Response("{}", { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("insights") ? [] : {}), { status: 200 });
    });

    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByText("active")).toBeInTheDocument());

    expect(calls.some((call) => call.includes("/demo/start"))).toBe(true);
    expect(calls.some((call) => call.includes("/demo/impact"))).toBe(false);
    expect(calls.filter((call) => call.includes("/learning/insights"))).toHaveLength(1);
    expect(calls.filter((call) => call.includes("/learning/reports/current"))).toHaveLength(1);
  });

  it("starts the activity stream from the new run after a reset", async () => {
    let overviewCalls = 0;
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        const runIdentifier = overviewCalls++ === 0 ? "run-1" : "run-2";
        const sequence = runIdentifier === "run-1" ? 5 : 1;
        return new Response(
          JSON.stringify({
            ...snapshot,
            incident: { ...snapshot.incident, runIdentifier },
            recentActivity: [{ identifier: `${runIdentifier}-activity`, sequence }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/demo/reset")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(<ResetProbe />);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.instances[0].url).toContain("afterSequence=5");

    fireEvent.click(screen.getByRole("button", { name: "reset" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(FakeEventSource.instances[1].url).toContain("runIdentifier=run-2");
    expect(FakeEventSource.instances[1].url).toContain("afterSequence=1");
  });
});

describe("live dashboard chrome", () => {
  afterEach(() => {
    casaPepeClient.forgetRun();
    vi.stubGlobal("EventSource", MockEventSource);
    vi.restoreAllMocks();
  });

  it("opens on the idle dashboard with impact armed and no start gate", async () => {
    let started = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        if (!started) return new Response(JSON.stringify({ message: "no run" }), { status: 409 });
        return new Response(JSON.stringify(idleSnapshot), { status: 200 });
      }
      if (url.includes("/demo/start")) {
        started = true;
        return new Response("{}", { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(
      <>
        <TopBar />
        <LiveOperationsDashboard />
      </>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Impacto" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Iniciar demo" })).not.toBeInTheDocument();
    expect(screen.queryByText("La simulación está preparada")).not.toBeInTheDocument();
    expect(screen.getByText("EN ESPERA")).toBeInTheDocument();
    expect(screen.getByText("Red operativa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ciclo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Demo" })).not.toBeInTheDocument();
  });

  it("stays on the idle dashboard after reset", async () => {
    let runIdentifier = "run-1";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({
            ...idleSnapshot,
            incident: { ...idleSnapshot.incident, runIdentifier },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/demo/reset")) {
        runIdentifier = "run-2";
        return new Response("{}", { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { user } = renderWithProviders(
      <>
        <TopBar />
        <LiveOperationsDashboard />
      </>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Impacto" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Reiniciar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Impacto" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Iniciar demo" })).not.toBeInTheDocument();
    expect(screen.queryByText("La simulación está preparada")).not.toBeInTheDocument();
    expect(screen.getByText("EN ESPERA")).toBeInTheDocument();
  });

  it("shows impact, twist, reset and the elapsed timer once a run is live", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(JSON.stringify(snapshot), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { user } = renderWithProviders(
      <>
        <TopBar />
        <LiveOperationsDashboard />
      </>,
    );

    await waitFor(() => expect(screen.getByText("Leyó el contexto del incidente")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Impacto" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Recortar capacidad" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reiniciar" })).toBeInTheDocument();
    expect(screen.getByText("Tiempo de incidente")).toBeInTheDocument();
    expect(screen.getAllByText("Recuperando Flujo de eventos").length).toBeGreaterThan(0);
    expect(screen.getByText("Leyó el contexto del incidente")).toBeInTheDocument();
    expect(screen.getByText("Migrando")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trabajo del agente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir al último" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar chat (debug)" })).toBeInTheDocument();
    expect(screen.queryByText("Completado")).not.toBeInTheDocument();
    expect(screen.queryByText("En curso")).not.toBeInTheDocument();
    expect(screen.queryByText(/Trabajo del agente ·/)).not.toBeInTheDocument();
    expect(screen.queryByText("llamadas")).not.toBeInTheDocument();
    expect(screen.queryByText("Parámetros")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ciclo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Demo" })).not.toBeInTheDocument();

    await user.click(screen.getByText("Leyó el contexto del incidente"));
    expect(screen.getByText("Parámetros")).toBeInTheDocument();
    expect(screen.getByText("Contexto del incidente cargado")).toBeInTheDocument();
    expect(screen.queryByText("Completado")).not.toBeInTheDocument();
  });

  it("renders the map panel when the overview omits topology", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({ ...snapshot, incident: { ...snapshot.incident, topology: undefined } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(<LiveOperationsDashboard />);

    await waitFor(() => expect(screen.getByText("Topología operativa")).toBeInTheDocument());
    expect(screen.getByText("Golfo · failover activo")).toBeInTheDocument();
  });

  it("holds the incident clock at zero until impact", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({
            ...snapshot,
            incident: { ...snapshot.incident, status: "normal", impactedAt: "", resolvedAt: "" },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(
      <>
        <TopBar />
        <LiveOperationsDashboard />
      </>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Impacto" })).toBeEnabled());
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("Tiempo de incidente")).toBeInTheDocument();
    expect(screen.queryByText("Resuelto")).not.toBeInTheDocument();
  });

  it("freezes the incident clock as Resuelto when the run recovers", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({
            ...snapshot,
            incident: {
              ...snapshot.incident,
              status: "recovered",
              impactedAt: "2026-09-19T10:00:00.000Z",
              resolvedAt: "2026-09-19T10:01:23.000Z",
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(
      <>
        <TopBar />
        <LiveOperationsDashboard />
      </>,
    );

    await waitFor(() => expect(screen.getByText("Resuelto")).toBeInTheDocument());
    expect(screen.getByText("01:23")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Impacto" })).toBeDisabled();
    expect(screen.queryByText("Tiempo de incidente")).not.toBeInTheDocument();
  });

  it("shows live public reasoning while a cycle is in progress", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({
            ...snapshot,
            toolCalls: [],
            recentActivity: [{
              identifier: "act_out",
              sequence: 1,
              occurredAt: "2026-09-19T10:00:03.000Z",
              type: "agent.llm-output",
              source: "agent",
              title: "Draft decision summary",
              summary: "Compruebo la capacidad restante",
              simulated: false,
              replayed: false,
              payload: { outputIdentifier: "out_1", provisional: true, text: "Compruebo la capacidad restante", turn: 0 },
            }],
            agent: { ...snapshot.agent, cycleInProgress: true, runningToolCalls: 0 },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(<LiveOperationsDashboard />);

    await waitFor(() => expect(screen.getAllByText("Pensando").length).toBeGreaterThan(0));
    expect(screen.getByText("Compruebo la capacidad restante")).toBeVisible();
    expect(screen.queryByText("Preparando el siguiente paso")).not.toBeInTheDocument();
  });

  it("collapses finished reasoning until expanded and keeps tool details separate", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({
            ...snapshot,
            toolCalls: [snapshot.toolCalls[0]],
            recentActivity: [{
              identifier: "act_decision",
              sequence: 2,
              occurredAt: "2026-09-19T10:00:02.000Z",
              type: "agent.llm-decision",
              source: "agent",
              title: "LLM decision",
              summary: "Necesito el contexto actual del incidente.",
              simulated: false,
              replayed: false,
              payload: { outputIdentifier: "out_ctx", turn: 0 },
            }],
            agent: { ...snapshot.agent, cycleInProgress: false, runningToolCalls: 0 },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { user } = renderWithProviders(<LiveOperationsDashboard />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Necesito el contexto actual del incidente\. · <1s/ })).toBeInTheDocument());
    expect(screen.getByText("Leyó el contexto del incidente")).toBeInTheDocument();
    expect(screen.queryByText("Razonamiento")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Necesito el contexto actual del incidente\. · <1s/ }));
    expect(screen.getByText("Necesito el contexto actual del incidente.")).toBeVisible();

    await user.click(screen.getByText("Leyó el contexto del incidente"));
    expect(screen.getByText("Parámetros")).toBeInTheDocument();
    expect(screen.getByText("Contexto del incidente cargado")).toBeInTheDocument();
  });

  it("keeps a reasoning trail when the model only emits placeholder decisions", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({
            ...snapshot,
            toolCalls: [],
            recentActivity: [
              {
                identifier: "act_d1",
                sequence: 1,
                occurredAt: "2026-09-19T10:00:03.000Z",
                type: "agent.llm-decision",
                source: "agent",
                title: "LLM decision",
                summary: "Selecting the next investigation or action",
                simulated: false,
                replayed: false,
                payload: {
                  outputIdentifier: "out_a",
                  tools: ["get_recovery_capacity"],
                  toolCalls: [{ id: "call_a", name: "get_recovery_capacity", arguments: {} }],
                  turn: 0,
                  text: null,
                  disposition: "rejected",
                  dispositionReason: "The proposed action did not pass runtime validation; the model must revise it.",
                  redacted: false,
                },
              },
              {
                identifier: "act_d2",
                sequence: 3,
                occurredAt: "2026-09-19T10:00:05.000Z",
                type: "agent.llm-decision",
                source: "agent",
                title: "LLM decision",
                summary: "Selecting the next investigation or action",
                simulated: false,
                replayed: false,
                payload: {
                  outputIdentifier: "out_b",
                  tools: ["get_recovery_capacity"],
                  toolCalls: [{ id: "call_b", name: "get_recovery_capacity", arguments: {} }],
                  turn: 1,
                  text: null,
                  disposition: "pending",
                  redacted: false,
                },
              },
            ],
            agent: { ...snapshot.agent, cycleInProgress: true, runningToolCalls: 0 },
          }),
          { status: 200 },
        );
      }
      if (isLlmHistory(url)) return jsonResponse({ items: [], nextBeforeSequence: null });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(<LiveOperationsDashboard />);

    await waitFor(() => expect(screen.getAllByText("Midiendo la capacidad de respaldo").length).toBeGreaterThan(0));
    expect(screen.getByText(/Rechazado/)).toBeInTheDocument();
    expect(screen.queryByText("Razonamiento")).not.toBeInTheDocument();
    expect(screen.queryByText("Selecting the next investigation or action")).not.toBeInTheDocument();
    expect(screen.queryByText("En espera")).not.toBeInTheDocument();
  });

  it("renders live plan to-dos with checks, spinner and pending rows", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({
            ...snapshot,
            plan: {
              kind: "plan",
              plan: {
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
                assumptions: [],
                changesFromPrevious: [],
                priorities: [],
                steps: [
                  {
                    identifier: "stp_prepare",
                    order: 1,
                    title: "Preparar la recuperación de Flujo de eventos",
                    reason: "",
                    owner: { kind: "agent", name: "Casa Pepe agent" },
                    serviceIdentifier: "events-stream",
                    capacityUnits: 2,
                    requiresApproval: false,
                    status: "completed",
                    statusReason: "",
                    resultSummary: "",
                    attempts: 1,
                    updatedAt: "2026-09-19T10:00:06.000Z",
                  },
                  {
                    identifier: "stp_execute",
                    order: 2,
                    title: "Ejecutar la recuperación de Flujo de eventos",
                    reason: "",
                    owner: { kind: "agent", name: "Casa Pepe agent" },
                    serviceIdentifier: "events-stream",
                    capacityUnits: 2,
                    requiresApproval: false,
                    status: "running",
                    statusReason: "",
                    resultSummary: "",
                    attempts: 1,
                    updatedAt: "2026-09-19T10:00:08.000Z",
                  },
                  {
                    identifier: "stp_verify",
                    order: 3,
                    title: "Verificar Flujo de eventos",
                    reason: "",
                    owner: { kind: "agent", name: "Casa Pepe agent" },
                    serviceIdentifier: "events-stream",
                    capacityUnits: 0,
                    requiresApproval: false,
                    status: "proposed",
                    statusReason: "",
                    resultSummary: "",
                    attempts: 0,
                    updatedAt: "2026-09-19T10:00:04.000Z",
                  },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { user } = renderWithProviders(<LiveOperationsDashboard />);

    await waitFor(() => expect(screen.getByText("1 de 3 tareas")).toBeInTheDocument());
    expect(screen.getByText("Preparar la recuperación de Flujo de eventos")).toBeVisible();
    expect(screen.getByText("Ejecutar la recuperación de Flujo de eventos")).toBeVisible();
    expect(screen.getByText("Verificar Flujo de eventos")).toBeVisible();
    expect(screen.getByText("Ejecutar la recuperación de Flujo de eventos").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.queryByText("Plan v1")).not.toBeInTheDocument();
    expect(screen.queryByText("Recuperar Flujo de eventos")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "1 de 3 tareas" }));
    await waitFor(() => expect(screen.queryByText("Verificar Flujo de eventos")).not.toBeInTheDocument());
  });

  it("labels a finished plan as completed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({
            ...snapshot,
            toolCalls: [snapshot.toolCalls[0]],
            agent: { ...snapshot.agent, runningToolCalls: 0 },
            plan: {
              kind: "plan",
              plan: {
                identifier: "plan_1",
                version: 2,
                status: "completed",
                summary: "Plan terminado",
                reason: "",
                capacity: {
                  resourceIdentifier: "engineers",
                  totalCapacity: 5,
                  assumedCapacity: 5,
                  plannedUnits: 2,
                  remainingUnits: 3,
                  postponedUnits: 0,
                  confirmed: true,
                },
                assumptions: [],
                changesFromPrevious: [],
                priorities: [],
                steps: [
                  {
                    identifier: "stp_a",
                    order: 1,
                    title: "Preparar la recuperación",
                    reason: "",
                    owner: { kind: "agent", name: "Casa Pepe agent" },
                    serviceIdentifier: "events-stream",
                    capacityUnits: 2,
                    requiresApproval: false,
                    status: "completed",
                    statusReason: "",
                    resultSummary: "",
                    attempts: 1,
                    updatedAt: "2026-09-19T10:00:06.000Z",
                  },
                  {
                    identifier: "stp_b",
                    order: 2,
                    title: "Recuperar y verificar",
                    reason: "",
                    owner: { kind: "agent", name: "Casa Pepe agent" },
                    serviceIdentifier: "events-stream",
                    capacityUnits: 2,
                    requiresApproval: false,
                    status: "completed",
                    statusReason: "",
                    resultSummary: "",
                    attempts: 1,
                    updatedAt: "2026-09-19T10:00:12.000Z",
                  },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { user } = renderWithProviders(<LiveOperationsDashboard />);

    await waitFor(() => expect(screen.getByText("2 de 2 tareas completadas")).toBeInTheDocument());
    expect(screen.queryByText("Preparar la recuperación")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "2 de 2 tareas completadas" }));
    expect(screen.getByText("Preparar la recuperación")).toBeVisible();
    expect(screen.getByText("Recuperar y verificar")).toBeVisible();
  });

  it("shows a CallKit banner while an engineer call is in progress", async () => {
    const startedAt = new Date(Date.now() - 12_000).toISOString();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({
            ...snapshot,
            engineerCalls: [
              {
                identifier: "call_1",
                engineer: { name: "Marta Ruiz", role: "Ingeniera de plataforma" },
                purpose: "Confirmar el failover",
                mode: "simulated",
                status: "in-progress",
                result: null,
                failureReason: "",
                startedAt,
                finishedAt: "",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(<LiveOperationsDashboard />);

    await waitFor(() => expect(screen.getByText("Llamando a Marta Ruiz")).toBeInTheDocument());
    expect(screen.getByRole("status", { name: /Llamando a Marta Ruiz/ })).toHaveTextContent(/\d{2}:\d{2}/);
    expect(screen.getByText("Ingeniera de plataforma")).toBeInTheDocument();
  });

  it("docks pending approval actions at the bottom of the agent panel", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isOverview(url)) {
        return new Response(
          JSON.stringify({
            ...snapshot,
            pendingApprovals: [
              {
                identifier: "apr_1",
                serviceIdentifier: "events-stream",
                actionSummary: "Llamar al ingeniero de turno",
                reason: "La recuperación necesita autorización del operador.",
                consequences: [],
                capacityUnits: 1,
                status: "pending",
                requestedAt: "2026-09-19T10:00:08.000Z",
                expiresAt: "2026-09-19T10:10:08.000Z",
              },
            ],
            agent: { ...snapshot.agent, pendingApprovals: 1 },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(<LiveOperationsDashboard />);

    const approve = await screen.findByRole("button", { name: "Aprobar" });
    const reject = screen.getByRole("button", { name: "Rechazar" });
    const debug = screen.getByRole("button", { name: "Copiar chat (debug)" });
    const prompt = screen.getByRole("alert");
    expect(screen.getByText("Llamar al ingeniero de turno")).toBeInTheDocument();
    expect(screen.getByText("La recuperación necesita autorización del operador.")).toBeInTheDocument();
    expect(prompt).toHaveClass("rounded-[6px]");
    expect(approve).toHaveClass("bg-white");
    expect(debug.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(reject.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
