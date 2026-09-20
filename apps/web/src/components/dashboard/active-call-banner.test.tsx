import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveCallBanner } from "@/components/dashboard/active-call-banner";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import type { ActivityRecord, EngineerCall } from "@/lib/casa-pepe-types";

const fixture = vi.hoisted(() => ({
  calls: [] as EngineerCall[],
  activity: [] as ActivityRecord[],
}));

vi.mock("./dashboard-provider", () => ({
  useDashboard: () => ({
    overview: { engineerCalls: fixture.calls, toolCalls: [] },
    activity: fixture.activity,
  }),
}));

function call(partial: Partial<EngineerCall>): EngineerCall {
  return {
    identifier: "call_demo",
    engineer: { name: "Guillermo", role: "Platform on-call engineer" },
    purpose: "Confirm the failover",
    mode: "live",
    status: "in-progress",
    result: null,
    failureReason: "",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    ...partial,
  };
}

const granted = {
  summary: "",
  transcript: "",
  authorizations: {
    notifyAllClients: { value: true },
    trafficFailoverAuthorized: { value: true },
  },
};

function renderBanner() {
  return render(
    <LocaleProvider>
      <ActiveCallBanner />
    </LocaleProvider>,
  );
}

describe("active call banner", () => {
  beforeEach(() => {
    fixture.calls = [];
    fixture.activity = [];
    window.localStorage.setItem("casa-pepe-locale", "es");
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("announces the call while nobody has decided anything", () => {
    fixture.calls = [call({})];
    renderBanner();

    expect(screen.getByText("Llamando a Guillermo")).toBeInTheDocument();
    expect(screen.queryByText("AUTORIZACIÓN RECIBIDA")).toBeNull();
  });

  it("announces the permission while the line is still open", async () => {
    // The tool reports it mid-call, so the card must not wait for the call to end.
    fixture.calls = [call({ status: "in-progress", result: granted })];
    renderBanner();

    await waitFor(
      () => expect(screen.getByText("AUTORIZACIÓN RECIBIDA")).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it("takes the card away once the permission has been read", async () => {
    fixture.calls = [call({ status: "in-progress", result: granted })];
    renderBanner();

    await waitFor(
      () => expect(screen.getByText("AUTORIZACIÓN RECIBIDA")).toBeInTheDocument(),
      { timeout: 3000 },
    );
    await waitFor(
      () => expect(screen.queryByText("AUTORIZACIÓN RECIBIDA")).toBeNull(),
      { timeout: 8000 },
    );
  });

  it("keeps a refused call out of the permission message", async () => {
    fixture.calls = [
      call({
        status: "completed",
        finishedAt: new Date().toISOString(),
        result: {
          summary: "",
          transcript: "",
          authorizations: {
            notifyAllClients: { value: false },
            trafficFailoverAuthorized: { value: false },
          },
        },
      }),
    ];
    renderBanner();

    expect(screen.getByText("Llamada finalizada")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(screen.queryByText("AUTORIZACIÓN RECIBIDA")).toBeNull();
  });
});
