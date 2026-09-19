import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMPACT_PAUSE_MS, useDashboard } from "@/components/dashboard/dashboard-provider";
import { TopBar } from "@/components/dashboard/top-bar";
import { LiveOperationsDashboard } from "@/components/dashboard/live-operations-dashboard";
import { renderWithProviders } from "@/test/render";

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
    region: "me-south-1",
    backupRegion: "me-central-1",
    status: "active",
    active: true,
    startedAt: "2026-09-19T10:00:00.000Z",
    impactedAt: "2026-09-19T10:00:02.000Z",
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

class MockEventSource {
  url: string;
  onerror: ((event?: Event) => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

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
  beforeEach(() => {
    vi.stubGlobal("EventSource", MockEventSource);
  });
  afterEach(() => {
    FakeEventSource.instances = [];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a deliberate ready state when the backend has no active run", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/overview")) {
        return new Response(
          JSON.stringify({
            message: "There is no active incident run. Start one through the demo controls first",
          }),
          { status: 409 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(<Probe />);

    await waitFor(() => expect(screen.getByText("ready")).toBeInTheDocument());
    expect(screen.queryByText(/No active run/)).not.toBeInTheDocument();
  });

  it("starts the scenario and then fires impact without fetching learning on every refresh", async () => {
    const calls: string[] = [];
    let overviewCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/overview")) {
        overviewCount += 1;
        if (overviewCount === 1) {
          return new Response(JSON.stringify({ message: "no run" }), { status: 409 });
        }
        return new Response(JSON.stringify(snapshot), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("insights") ? [] : {}), { status: 200 });
    });

    const { user } = renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByText("ready")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "start" }));
    await waitFor(() => expect(calls.some((call) => call.includes("/demo/impact"))).toBe(true), {
      timeout: IMPACT_PAUSE_MS + 2000,
    });
    await waitFor(() => expect(screen.getByText("active")).toBeInTheDocument());

    expect(calls.some((call) => call.includes("/demo/start"))).toBe(true);
    expect(calls.filter((call) => call.includes("/learning/insights"))).toHaveLength(1);
    expect(calls.filter((call) => call.includes("/learning/reports/current"))).toHaveLength(1);
  });

  it("starts the activity stream from the new run after a reset", async () => {
    let overviewCalls = 0;
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/overview")) {
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
  beforeEach(() => {
    vi.stubGlobal("EventSource", MockEventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps start on the empty state and compact operator controls in the header", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/overview")) {
        return new Response(JSON.stringify({ message: "no run" }), { status: 409 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderWithProviders(
      <>
        <TopBar />
        <LiveOperationsDashboard />
      </>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar demo" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Ciclo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Demo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Impacto" })).not.toBeInTheDocument();
  });

  it("shows impact, twist, reset and the elapsed timer once a run is live", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/overview")) {
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

    await waitFor(() => expect(screen.getByRole("button", { name: "Impacto" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Twist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reiniciar" })).toBeInTheDocument();
    expect(screen.getByText("Tiempo de incidente")).toBeInTheDocument();
    expect(screen.getAllByText("Recuperando Flujo de eventos").length).toBeGreaterThan(0);
    expect(screen.getByText("Leyó el contexto del incidente")).toBeInTheDocument();
    expect(screen.getByText("recuperando")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trabajo del agente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir al último" })).toBeInTheDocument();
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
      if (url.endsWith("/overview")) {
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
});
