import { describe, expect, it, vi } from "vitest";
import { casaPepeClient } from "@/lib/casa-pepe-client";

describe("Casa Pepe browser client", () => {
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
});
