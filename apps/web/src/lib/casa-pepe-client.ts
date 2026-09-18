import type { LearningInsight, Overview, RunReport } from "@/lib/casa-pepe-types";

export class CasaPepeClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CasaPepeClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (response.ok) return (await response.json()) as T;
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  throw new CasaPepeClientError(
    body?.message ?? "No se pudo completar la acción.",
    response.status,
  );
}

export const casaPepeClient = {
  overview: () => request<Overview>("/api/casa-pepe/overview"),
  insights: () => request<LearningInsight[]>("/api/casa-pepe/learning/insights"),
  report: () => request<RunReport>("/api/casa-pepe/learning/reports/current"),
  start: () =>
    request("/api/casa-pepe/demo/start", {
      method: "POST",
      body: JSON.stringify({ scenarioIdentifier: "meteorite-eu-west-1-es" }),
    }),
  impact: () => request("/api/casa-pepe/demo/impact", { method: "POST" }),
  twist: () => request("/api/casa-pepe/demo/twist", { method: "POST" }),
  reset: () => request("/api/casa-pepe/demo/reset", { method: "POST" }),
  runCycle: () =>
    request("/api/casa-pepe/agent/cycle", {
      method: "POST",
      body: JSON.stringify({ operatorName: "Operador Casa Pepe" }),
    }),
  decideApproval: (identifier: string, decision: "approve" | "reject", comment: string) =>
    request(`/api/casa-pepe/approvals/${encodeURIComponent(identifier)}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comment, operatorName: "Operador Casa Pepe" }),
    }),
};
