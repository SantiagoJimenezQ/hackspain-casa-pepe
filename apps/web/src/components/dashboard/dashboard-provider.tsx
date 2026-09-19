"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/components/i18n/locale-provider";
import { CasaPepeClientError, casaPepeClient } from "@/lib/casa-pepe-client";
import { isLlmActivityType } from "@/lib/agent-trace";
import type { ActivityRecord, LearningInsight, Overview, RunReport } from "@/lib/casa-pepe-types";
import type { Locale } from "@/lib/i18n";

type DashboardStatus = "loading" | "active" | "error";
type DemoAction = "start" | "impact" | "twist" | "reset" | "reset-learnings" | "cycle" | "language" | null;

type DashboardContextValue = {
  status: DashboardStatus;
  overview: Overview | null;
  insights: LearningInsight[];
  learningLoading: boolean;
  learningError: string | null;
  refreshLearning: () => Promise<void>;
  report: RunReport | null;
  activity: ActivityRecord[];
  error: string | null;
  busyAction: DemoAction;
  retry: () => Promise<void>;
  startDemo: () => Promise<void>;
  triggerImpact: () => Promise<void>;
  triggerTwist: () => Promise<void>;
  resetDemo: () => Promise<void>;
  switchLanguage: (locale: Locale) => Promise<void>;
  resetLearnings: () => Promise<void>;
  learningResetMessage: string | null;
  runAgentCycle: () => Promise<void>;
  decideApproval: (identifier: string, decision: "approve" | "reject", comment: string) => Promise<void>;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

const ACTIVITY_EVENTS = [
  "agent.llm-output",
  "agent.llm-decision", "agent.llm-failed", "agent.llm-stale", "agent.llm-rejected",
  "engineer-call.incoming", "incident.run-started", "incident.impact-detected",
  "incident.event-applied", "incident.status-changed", "incident.run-reset",
  "service.health-changed", "resource.capacity-changed", "fact.recorded",
  "plan.created", "plan.revised", "plan-step.updated", "decision.recorded",
  "tool-call.started", "tool-call.completed", "tool-call.failed", "approval.requested",
  "approval.decided", "approval.superseded", "approval.expired", "task.assigned",
  "task.updated", "engineer-call.started", "engineer-call.completed",
  "engineer-call.failed", "engineer-call.authorized", "recovery.executed", "recovery.verified", "services.checked", "simulation.advanced",
  "agent.cycle-finished", "agent.limit-reached", "replay.started", "replay.finished",
] as const;

function outputIdentifierOf(event: ActivityRecord): string {
  const payload = event.payload;
  const value = payload && typeof payload === "object" ? payload.outputIdentifier : null;
  return typeof value === "string" && value.trim() ? value : "";
}

function compactActivity(events: ActivityRecord[]) {
  const completed = new Set(
    events
      .filter((event) => isLlmActivityType(event.type) && event.type !== "agent.llm-output")
      .map(outputIdentifierOf)
      .filter(Boolean),
  );
  const kept = events.filter((event) => {
    if (event.type !== "agent.llm-output") return true;
    const id = outputIdentifierOf(event);
    return !id || !completed.has(id);
  });
  const llm: ActivityRecord[] = [];
  const other: ActivityRecord[] = [];
  for (const event of kept) {
    if (isLlmActivityType(event.type)) llm.push(event);
    else other.push(event);
  }
  return [...llm, ...other.slice(-100)].toSorted((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    return left.identifier.localeCompare(right.identifier);
  });
}

function mergeActivity(current: ActivityRecord[], incoming: ActivityRecord) {
  const existing = current.find((item) => item.identifier === incoming.identifier);
  if (existing) {
    return compactActivity(current.map((item) => item.identifier === incoming.identifier
      ? { ...item, ...incoming, payload: incoming.payload ?? item.payload }
      : item));
  }
  return compactActivity([...current, incoming]);
}

function mergeActivityList(current: ActivityRecord[], incoming: ActivityRecord[]) {
  return incoming.reduce((items, item) => mergeActivity(items, item), current);
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DashboardStatus>("loading");
  const { locale, setLocale } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [learningResetMessage, setLearningResetMessage] = useState<string | null>(null);
  const learningGeneration = useRef(0);
  const [learningLoading, setLearningLoading] = useState(false);
  const [learningError, setLearningError] = useState<string | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<DemoAction>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRunIdentifier = useRef<string | null>(null);
  const latestSequence = useRef(0);
  const startGeneration = useRef(0);
  const ensuringRun = useRef(false);
  const learningLoaded = useRef(false);

  const loadLlmHistory = useCallback(async (runIdentifier: string, generation: number) => {
    try {
      let beforeSequence: number | undefined;
      const pages: ActivityRecord[] = [];
      for (let page = 0; page < 8; page += 1) {
        const result = await casaPepeClient.llmHistory({
          beforeSequence,
          limit: 100,
          runIdentifier,
        });
        if (!Array.isArray(result.items)) break;
        pages.push(...result.items);
        if (result.nextBeforeSequence == null) break;
        beforeSequence = result.nextBeforeSequence;
      }
      if (generation !== startGeneration.current) return;
      if (latestRunIdentifier.current !== runIdentifier) return;
      startTransition(() => {
        setActivity((current) => mergeActivityList(current, pages));
      });
    } catch {
      // Live SSE still renders; older turns are additive history.
    }
  }, []);

  const applyOverview = useCallback((next: Overview) => {
    const nextSequence = Math.max(0, ...next.recentActivity.map((item) => item.sequence));
    const runChanged = latestRunIdentifier.current !== next.incident.runIdentifier;
    latestRunIdentifier.current = next.incident.runIdentifier;
    latestSequence.current = runChanged
      ? nextSequence
      : Math.max(latestSequence.current, nextSequence);
    startTransition(() => {
      setOverview(next);
      setActivity((current) => runChanged ? next.recentActivity : mergeActivityList(current, next.recentActivity));
      setError(null);
      setStatus("active");
    });
    if (runChanged && next.incident.runIdentifier) {
      void loadLlmHistory(next.incident.runIdentifier, startGeneration.current);
    }
  }, [loadLlmHistory]);

  const loadLearning = useCallback(async (force = false) => {
    if (learningLoaded.current && !force) return;
    learningLoaded.current = true;
    const generation = ++learningGeneration.current;
    setLearningLoading(true);
    setLearningError(null);
    const [insightsResult, reportResult] = await Promise.allSettled([
      casaPepeClient.insights(),
      casaPepeClient.report(),
    ]);
    if (generation !== learningGeneration.current) return;
    startTransition(() => {
      setLearningLoading(false);
      if (insightsResult.status === "fulfilled") setInsights(insightsResult.value);
      else setLearningError("No se pudieron cargar los aprendizajes. Vuelve a intentarlo.");
      if (reportResult.status === "fulfilled") setReport(reportResult.value);
    });
  }, []);

  const refreshLearning = useCallback(() => loadLearning(true), [loadLearning]);

  const refreshOverview = useCallback(async () => {
    const generation = startGeneration.current;
    try {
      const next = await casaPepeClient.overview();
      if (generation !== startGeneration.current) return;
      applyOverview(next);
      void loadLearning();
    } catch (cause) {
      if (generation !== startGeneration.current) return;
      const known = cause instanceof CasaPepeClientError ? cause : null;
      if (known?.status === 404 || known?.status === 409) {
        if (ensuringRun.current) return;
        ensuringRun.current = true;
        const startGen = ++startGeneration.current;
        setBusyAction("start");
        setError(null);
        try {
          await casaPepeClient.start();
          if (startGen !== startGeneration.current) return;
          const next = await casaPepeClient.overview();
          if (startGen !== startGeneration.current) return;
          applyOverview(next);
          void loadLearning();
        } catch (startCause) {
          if (startGen !== startGeneration.current) return;
          const startError = startCause instanceof CasaPepeClientError ? startCause : null;
          learningLoaded.current = false;
          latestRunIdentifier.current = null;
          latestSequence.current = 0;
          setOverview(null);
          setInsights([]);
          setReport(null);
          setActivity([]);
          setError(startError?.message ?? "No se pudo completar la acción solicitada.");
          setStatus("error");
        } finally {
          ensuringRun.current = false;
          if (startGen === startGeneration.current) setBusyAction(null);
        }
        return;
      }
      setError(known?.message ?? "No se pudo contactar con el backend de Casa Pepe.");
      setStatus((current) => (current === "active" ? current : "error"));
    }
  }, [applyOverview, loadLearning]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshOverview(), 0);
    return () => {
      window.clearTimeout(initialLoad);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refreshOverview]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refreshOverview(), 350);
  }, [refreshOverview]);

  useEffect(() => {
    const runIdentifier = overview?.incident.runIdentifier;
    if (!runIdentifier || status !== "active") return;
    const source = new EventSource(
      `/api/casa-pepe/activity/stream?runIdentifier=${encodeURIComponent(runIdentifier)}&afterSequence=${latestSequence.current}`,
    );
    const receive = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as ActivityRecord;
        latestSequence.current = Math.max(latestSequence.current, event.sequence);
        startTransition(() => setActivity((current) => mergeActivity(current, event)));
        if (event.type !== "agent.llm-output") scheduleRefresh();
      } catch {
        // A malformed event must not stop the remainder of the live demo stream.
      }
    };
    for (const eventName of ACTIVITY_EVENTS) source.addEventListener(eventName, receive);
    source.onerror = () => scheduleRefresh();
    return () => {
      for (const eventName of ACTIVITY_EVENTS) source.removeEventListener(eventName, receive);
      source.close();
    };
  }, [overview?.incident.runIdentifier, scheduleRefresh, status]);

  // The run decides the language: its scenario, its plans and everything the agent already
  // wrote are in it. The interface follows so no screen ever mixes two languages.
  const runLanguage = overview?.agent.language;
  useEffect(() => {
    if (runLanguage !== undefined && runLanguage !== locale) setLocale(runLanguage);
  }, [locale, runLanguage, setLocale]);

  const execute = useCallback(async (action: Exclude<DemoAction, null>, work: () => Promise<unknown>) => {
    setBusyAction(action);
    setError(null);
    try {
      await work();
      await refreshOverview();
    } catch (cause) {
      const known = cause instanceof CasaPepeClientError ? cause : null;
      setError(known?.message ?? "No se pudo completar la acción solicitada.");
      setStatus((current) => (current === "active" ? current : "error"));
    } finally {
      setBusyAction(null);
    }
  }, [refreshOverview]);

  const retry = useCallback(async () => {
    setStatus("loading");
    await refreshOverview();
  }, [refreshOverview]);

  const startDemo = useCallback(async () => {
    const generation = ++startGeneration.current;
    setBusyAction("start");
    setError(null);
    try {
      await casaPepeClient.start(locale);
      await refreshOverview();
    } catch (cause) {
      const known = cause instanceof CasaPepeClientError ? cause : null;
      setError(known?.message ?? "No se pudo completar la acción solicitada.");
      setStatus((current) => (current === "active" ? current : "error"));
    } finally {
      if (generation === startGeneration.current) setBusyAction(null);
    }
  }, [locale, refreshOverview]);

  const triggerImpact = useCallback(() => execute("impact", casaPepeClient.impact), [execute]);
  const triggerTwist = useCallback(() => execute("twist", casaPepeClient.twist), [execute]);
  const resetDemo = useCallback(async () => {
    startGeneration.current += 1;
    learningLoaded.current = false;
    await execute("reset", casaPepeClient.reset);
  }, [execute]);
  /**
   * The agent writes in the language of its scenario, so the selector moves the run to the
   * scenario written in the chosen language. The interface switches first, and the run that
   * comes back confirms it.
   */
  const switchLanguage = useCallback(async (next: Locale) => {
    setLocale(next);
    startGeneration.current += 1;
    learningLoaded.current = false;
    await execute("language", () => casaPepeClient.switchLanguage(next));
  }, [execute, setLocale]);
  const resetLearnings = useCallback(() => execute("reset-learnings", async () => {
    setLearningResetMessage(null);
    const { removed } = await casaPepeClient.resetLearnings();
    learningGeneration.current += 1;
    learningLoaded.current = false;
    setInsights([]);
    setReport((current) => current ? { ...current, lessons: [] } : null);
    setLearningResetMessage(`${removed} aprendizajes borrados. Reinicia la demo para empezar sin memoria previa.`);
    await loadLearning();
  }), [execute, loadLearning]);
  const runAgentCycle = useCallback(() => execute("cycle", casaPepeClient.runCycle), [execute]);
  const decideApproval = useCallback(
    (identifier: string, decision: "approve" | "reject", comment: string) =>
      execute("cycle", () => casaPepeClient.decideApproval(identifier, decision, comment)),
    [execute],
  );

  const value = useMemo(
    () => ({
      status, overview, insights, learningLoading, learningError, refreshLearning, report, activity, error, busyAction, retry, startDemo, triggerImpact,
      triggerTwist, resetDemo, switchLanguage, resetLearnings, learningResetMessage, runAgentCycle, decideApproval,
    }),
    [status, overview, insights, learningLoading, learningError, refreshLearning, report, activity, error, busyAction, retry, startDemo, triggerImpact, triggerTwist, resetDemo, switchLanguage, resetLearnings, learningResetMessage, runAgentCycle, decideApproval],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("useDashboard must be used within DashboardProvider");
  return context;
}
