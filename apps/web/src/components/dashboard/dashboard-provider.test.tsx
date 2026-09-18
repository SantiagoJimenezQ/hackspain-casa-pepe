import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { renderWithProviders } from "@/test/render";

function Probe() {
  const { snapshot, sendFollowUp, advanceAgent, cycleSiteStatus, reset } =
    useDashboard();
  return (
    <div>
      <p>{snapshot.incident.localTime}</p>
      <p data-testid="madrid">{snapshot.sites.find((site) => site.id === "madrid")?.status}</p>
      <p data-testid="activity">{snapshot.agent.activity.length}</p>
      <p data-testid="completed">{snapshot.agent.completed}</p>
      <button type="button" onClick={() => sendFollowUp("   ")}>
        empty
      </button>
      <button type="button" onClick={() => sendFollowUp("Prioriza Valencia")}>
        follow
      </button>
      <button type="button" onClick={advanceAgent}>
        advance
      </button>
      <button type="button" onClick={() => cycleSiteStatus("madrid")}>
        cycle
      </button>
      <button type="button" onClick={reset}>
        reset
      </button>
    </div>
  );
}

describe("DashboardProvider", () => {
  it("throws outside the provider", () => {
    expect(() => render(<Probe />)).toThrow(/useDashboard must be used within DashboardProvider/);
  });

  it("ignores blank follow-ups and records real ones", async () => {
    const { user } = renderWithProviders(<Probe />);
    const initial = Number(screen.getByTestId("activity").textContent);
    await user.click(screen.getByRole("button", { name: "empty" }));
    expect(screen.getByTestId("activity")).toHaveTextContent(String(initial));
    await user.click(screen.getByRole("button", { name: "follow" }));
    expect(screen.getByTestId("activity")).toHaveTextContent(String(initial + 2));
  });

  it("advances the agent, cycles site health, and resets", async () => {
    const { user } = renderWithProviders(<Probe />);
    await user.click(screen.getByRole("button", { name: "advance" }));
    expect(screen.getByTestId("madrid")).toHaveTextContent("down");
    await user.click(screen.getByRole("button", { name: "cycle" }));
    expect(screen.getByTestId("madrid")).toHaveTextContent("up");
    await user.click(screen.getByRole("button", { name: "reset" }));
    expect(screen.getByTestId("madrid")).toHaveTextContent("down");
    expect(screen.getByTestId("completed")).toHaveTextContent("2");
  });
});
