import type { UnchangedOverview } from "../../../../packages/contracts/overview";
import type { CapacityChangeRequest, DeliveryProbeResult, LearningInsight, LlmHistoryPage, Overview, RunReport } from "@/lib/casa-pepe-types";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export class CasaPepeClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CasaPepeClientError";
  }
}

// The server resolves the active run from the HttpOnly browser cookie.
// A previous localStorage run ID is deliberately ignored after this migration.
let currentRunIdentifier = "";
const readStoredRun = () => currentRunIdentifier;
const rememberRun = (runIdentifier: string) => { currentRunIdentifier = runIdentifier; };
const withRun = (path: string) => path;

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

type RunScoped = { runIdentifier?: string };

/** Each locale has its own scenario: the language of a run is the language it is written in. */
const SCENARIO_BY_LOCALE: Record<Locale, string> = {
  es: "meteorite-me-south-1-es",
  en: "meteorite-me-south-1",
};

async function startRun(path: string, body?: string): Promise<RunScoped> {
  const snapshot = await request<RunScoped>(path, { method: "POST", body });
  if (snapshot.runIdentifier) rememberRun(snapshot.runIdentifier);
  return snapshot;
}

export const casaPepeClient = {
  overviewIfChanged: async (revision?: string): Promise<Overview | null> => {
    const suffix = revision ? `?knownRevision=${encodeURIComponent(revision)}` : "";
    const result = await request<Overview | UnchangedOverview>(`/api/casa-pepe/overview${suffix}`);
    if ("unchanged" in result) return null;
    rememberRun(result.incident.runIdentifier);
    return result;
  },
  currentRunIdentifier: () => readStoredRun(),
  forgetRun: () => rememberRun(""),
  overview: async () => {
    const overview = await request<Overview>("/api/casa-pepe/overview");
    rememberRun(overview.incident.runIdentifier);
    return overview;
  },
  llmHistory: (options?: { runIdentifier?: string; beforeSequence?: number; limit?: number }) => {
    const params = new URLSearchParams();
    const runIdentifier = options?.runIdentifier || readStoredRun();
    if (runIdentifier) params.set("runIdentifier", runIdentifier);
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.beforeSequence) params.set("beforeSequence", String(options.beforeSequence));
    const suffix = params.size ? `?${params.toString()}` : "";
    return request<LlmHistoryPage>(`/api/casa-pepe/activity/llm${suffix}`);
  },
  insights: () => request<LearningInsight[]>("/api/casa-pepe/learning/insights"),
  resetLearnings: () => request<{ removed: number }>("/api/casa-pepe/learning/insights", { method: "DELETE" }),
  report: () => request<RunReport>(withRun("/api/casa-pepe/learning/reports/current")),
  start: (locale: Locale = DEFAULT_LOCALE) =>
    startRun(
      "/api/casa-pepe/demo/start",
      JSON.stringify({ scenarioIdentifier: SCENARIO_BY_LOCALE[locale] }),
    ),
  switchLanguage: (locale: Locale) =>
    startRun(
      withRun("/api/casa-pepe/demo/language"),
      JSON.stringify({ language: locale }),
    ),
  impact: () => request(withRun("/api/casa-pepe/demo/impact"), { method: "POST" }),
  changeCapacity: (input: CapacityChangeRequest) => request("/api/casa-pepe/demo/capacity", { method: "POST", body: JSON.stringify(input) }),
  probeDelivery: (runIdentifier: string) => request<DeliveryProbeResult>("/api/casa-pepe/recovery/probe", { method: "POST", body: JSON.stringify({ runIdentifier }) }),
  twist: () => request(withRun("/api/casa-pepe/demo/twist"), { method: "POST" }),
  reset: () => startRun(withRun("/api/casa-pepe/demo/reset")),
  runCycle: () =>
    request(withRun("/api/casa-pepe/agent/cycle"), {
      method: "POST",
      body: JSON.stringify({ operatorName: "Operador Casa Pepe" }),
    }),
  decideApproval: (identifier: string, decision: "approve" | "reject", comment: string) =>
    request(`/api/casa-pepe/approvals/${encodeURIComponent(identifier)}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comment, operatorName: "Operador Casa Pepe" }),
    }),
};
