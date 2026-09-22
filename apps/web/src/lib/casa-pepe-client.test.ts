import { afterEach, describe, expect, it, vi } from "vitest";
import { casaPepeClient } from "@/lib/casa-pepe-client";

describe("Casa Pepe browser client", () => {
  it("handles unchanged snapshots without replacing the current run", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ runIdentifier: "run_1" }));
    await casaPepeClient.start();
    fetchMock.mockResolvedValue(Response.json({ unchanged: true, revision: "abc" }));
    expect(await casaPepeClient.overviewIfChanged("abc")).toBeNull();
    expect(casaPepeClient.currentRunIdentifier()).toBe("run_1");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/casa-pepe/overview?knownRevision=abc", expect.anything());
  });

  it("projects saved customer names and history while preserving request identities", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      incident: { runIdentifier: "run_1", customers: [{ identifier: "emirates-nbd", name: "Emirates NBD", shortName: "ENBD", logo: "/logos/emirates-nbd.png" }] },
      recentActivity: [{ summary: "Priorizar PureHealth y Deliveroo", payload: { customerIdentifier: "purehealth" } }],
    }));
    const overview = await casaPepeClient.overview();
    expect(overview.incident.customers[0]).toEqual({ identifier: "emirates-nbd", name: "Meridian Bank", shortName: "MB", logo: "/logos/meridian-bank.svg" });
    expect(overview.recentActivity[0]).toMatchObject({ summary: "Priorizar Clarity Health y Dasharoo", payload: { customerIdentifier: "purehealth" } });
  });

  afterEach(() => {
    casaPepeClient.forgetRun();
    vi.restoreAllMocks();
  });
  it("starts the fixed Spanish scenario without exposing backend details", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ runIdentifier: "run_1" }), { status: 200 }),
    );

    await casaPepeClient.start();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/casa-pepe/demo/start",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ scenarioIdentifier: "meteorite-me-south-1-es" }) }),
    );
  });

  it("sends approval decisions through the scoped frontend route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ identifier: "apr_1" }), { status: 200 }),
    );

    await casaPepeClient.decideApproval("apr_1", "approve", "Adelante");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/casa-pepe/approvals/apr_1/decision",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decision: "approve", comment: "Adelante", operatorName: "Operador Casa Pepe" }),
      }),
    );
  });

  it("normalizes a backend error for a visible operator message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Clave de API inválida" }), { status: 401 }),
    );

    await expect(casaPepeClient.overview()).rejects.toMatchObject({
      status: 401,
      message: "Clave de API inválida",
    });
  });

  it("loads public LLM history through the frontend proxy with the stored run", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ runIdentifier: "run_1" }), { status: 200 }),
    );

    await casaPepeClient.start();
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextBeforeSequence: 12 }), { status: 200 }),
    );

    await casaPepeClient.llmHistory({ limit: 50, beforeSequence: 12 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/casa-pepe/activity/llm?runIdentifier=run_1&limit=50&beforeSequence=12",
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) }),
    );
  });
});
