import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardProvider, useDashboard } from "@/components/dashboard/dashboard-provider";

function Probe() {
  const { status, error } = useDashboard();
  return <><p>{status}</p>{error ? <p>{error}</p> : null}</>;
}

function ResetProbe() {
  const { resetDemo } = useDashboard();
  return <button onClick={() => void resetDemo()}>reset</button>;
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

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe("live dashboard provider", () => {
  it("shows a deliberate ready state when the backend has no active run", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/overview")) {
        return new Response(JSON.stringify({ message: "No active run" }), { status: 404 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    render(<DashboardProvider><Probe /></DashboardProvider>);

    await waitFor(() => expect(screen.getByText("ready")).toBeInTheDocument());
    expect(screen.queryByText(/No active run/)).not.toBeInTheDocument();
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
            incident: { runIdentifier },
            recentActivity: [{ identifier: `${runIdentifier}-activity`, sequence }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/demo/reset")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    render(<DashboardProvider><ResetProbe /></DashboardProvider>);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.instances[0].url).toContain("afterSequence=5");

    fireEvent.click(screen.getByRole("button", { name: "reset" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(FakeEventSource.instances[1].url).toContain("runIdentifier=run-2");
    expect(FakeEventSource.instances[1].url).toContain("afterSequence=1");
  });
});
