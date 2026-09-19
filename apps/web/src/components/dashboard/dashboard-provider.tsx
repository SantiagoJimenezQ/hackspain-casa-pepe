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
import { CasaPepeClientError, casaPepeClient } from "@/lib/casa-pepe-client";
import type { ActivityRecord, LearningInsight, Overview, RunReport } from "@/lib/casa-pepe-types";

type DashboardStatus = "ready" | "loading" | "active" | "error";
type DemoAction = "start" | "impact" | "twist" | "reset" | "cycle" | null;

type DashboardContextValue = {
  status: DashboardStatus;
  overview: Overview | null;
  insights: LearningInsight[];
  report: RunReport | null;
  activity: ActivityRecord[];
  error: string | null;
  busyAction: DemoAction;
  retry: () => Promise<void>;
  startDemo: () => Promise<void>;
  triggerImpact: () => Promise<void>;
  triggerTwist: () => Promise<void>;
  resetDemo: () => Promise<void>;
  runAgentCycle: () => Promise<void>;
  decideApproval: (identifier: string, decision: "approve" | "reject", comment: string) => Promise<void>;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

const ACTIVITY_EVENTS = [
  "agent.llm-decision", "agent.llm-failed", "agent.llm-stale", "agent.llm-rejected",
  "engineer-call.incoming", "incident.run-started", "incident.impact-detected",
  "incident.event-applied", "incident.status-changed", "incident.run-reset",
  "service.health-changed", "resource.capacity-changed", "fact.recorded",
  "plan.created", "plan.revised", "plan-step.updated", "decision.recorded",
  "tool-call.started", "tool-call.completed", "tool-call.failed", "approval.requested",
  "approval.decided", "approval.superseded", "approval.expired", "task.assigned",
  "task.updated", "engineer-call.started", "engineer-call.completed",
  "engineer-call.failed", "recovery.executed", "recovery.verified", "services.checked", "simulation.advanced",
  "agent.cycle-finished", "agent.limit-reached", "replay.started", "replay.finished",
] as const;

function mergeActivity(current: ActivityRecord[], incoming: ActivityRecord) {
  if (current.some((item) => item.identifier === incoming.identifier)) return current;
  return [...current, incoming].toSorted((a, b) => a.sequence - b.sequence).slice(-100);
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DashboardStatus>("loading");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [report, setReport] = useState<RunReport | null>(null);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<DemoAction>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRunIdentifier = useRef<string | null>(null);
  const latestSequence = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [overviewResult, insightsResult, reportResult] = await Promise.allSettled([
        casaPepeClient.overview(),
        casaPepeClient.insights(),
        casaPepeClient.report(),
      ]);
      if (overviewResult.status === "rejected") throw overviewResult.reason;
      const next = overviewResult.value;
      const nextSequence = Math.max(0, ...next.recentActivity.map((item) => item.sequence));
      if (latestRunIdentifier.current !== next.incident.runIdentifier) {
        latestRunIdentifier.current = next.incident.runIdentifier;
        latestSequence.current = nextSequence;
      } else {
        latestSequence.current = Math.max(latestSequence.current, nextSequence);
      }
      startTransition(() => {
        setOverview(next);
        setInsights(insightsResult.status === "fulfilled" ? insightsResult.value : []);
        setReport(reportResult.status === "fulfilled" ? reportResult.value : null);
        setActivity(next.recentActivity);
        setError(null);
        setStatus("active");
      });
    } catch (cause) {
      const known = cause instanceof CasaPepeClientError ? cause : null;
      if (known?.status === 404) {
        latestRunIdentifier.current = null;
        latestSequence.current = 0;
        setOverview(null);
        setInsights([]);
        setReport(null);
        setActivity([]);
        setError(null);
        setStatus("ready");
        return;
      }
      setError(known?.message ?? "No se pudo contactar con el backend de Casa Pepe.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(initialLoad);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refresh(), 350);
  }, [refresh]);

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
        scheduleRefresh();
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

  const execute = useCallback(async (action: Exclude<DemoAction, null>, work: () => Promise<unknown>) => {
    setBusyAction(action);
    setError(null);
    try {
      await work();
      await refresh();
    } catch (cause) {
      const known = cause instanceof CasaPepeClientError ? cause : null;
      setError(known?.message ?? "No se pudo completar la acción solicitada.");
      setStatus((current) => (current === "active" ? current : "error"));
    } finally {
      setBusyAction(null);
    }
  }, [refresh]);

  const retry = useCallback(async () => {
    setStatus("loading");
    await refresh();
  }, [refresh]);
  const startDemo = useCallback(() => execute("start", casaPepeClient.start), [execute]);
  const triggerImpact = useCallback(() => execute("impact", casaPepeClient.impact), [execute]);
  const triggerTwist = useCallback(() => execute("twist", casaPepeClient.twist), [execute]);
  const resetDemo = useCallback(() => execute("reset", casaPepeClient.reset), [execute]);
  const runAgentCycle = useCallback(() => execute("cycle", casaPepeClient.runCycle), [execute]);
  const decideApproval = useCallback(
    (identifier: string, decision: "approve" | "reject", comment: string) =>
      execute("cycle", () => casaPepeClient.decideApproval(identifier, decision, comment)),
    [execute],
  );

  const value = useMemo(
    () => ({
      status, overview, insights, report, activity, error, busyAction, retry, startDemo, triggerImpact,
      triggerTwist, resetDemo, runAgentCycle, decideApproval,
    }),
    [status, overview, insights, report, activity, error, busyAction, retry, startDemo, triggerImpact, triggerTwist, resetDemo, runAgentCycle, decideApproval],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("useDashboard must be used within DashboardProvider");
  return context;
}
