import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardProvider, useDashboard } from "@/components/dashboard/dashboard-provider";

function Probe() {
  const { status, error } = useDashboard();
  return <><p>{status}</p>{error ? <p>{error}</p> : null}</>;
}

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
});
