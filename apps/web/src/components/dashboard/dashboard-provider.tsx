"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  DashboardSnapshot,
  HealthStatus,
  SiteId,
} from "@/lib/dashboard-types";
import { appendFollowUp, withAdvancedAgent } from "@/lib/advance-agent";
import { createInitialSnapshot } from "@/lib/mock-snapshot";

type DashboardContextValue = {
  snapshot: DashboardSnapshot;
  reset: () => void;
  setSiteStatus: (id: SiteId, status: HealthStatus) => void;
  setLinkStatus: (id: string, status: HealthStatus | undefined) => void;
  cycleSiteStatus: (id: SiteId) => void;
  cycleLinkStatus: (id: string) => void;
  advanceAgent: () => void;
  sendFollowUp: (text: string) => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

const STATUS_CYCLE: HealthStatus[] = ["up", "degraded", "down"];

function nextStatus(status: HealthStatus): HealthStatus {
  const index = STATUS_CYCLE.indexOf(status);
  return STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length];
}

function applySiteStatus(
  snapshot: DashboardSnapshot,
  id: SiteId,
  status: HealthStatus,
): DashboardSnapshot {
  return {
    ...snapshot,
    sites: snapshot.sites.map((site) =>
      site.id === id ? { ...site, status } : site,
    ),
    infrastructure: snapshot.infrastructure.map((node) =>
      node.id === id
        ? {
            ...node,
            status,
            capacity:
              status === "down"
                ? 0
                : node.capacity === 0
                  ? 100
                  : node.capacity,
          }
        : node,
    ),
  };
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(createInitialSnapshot);

  const reset = useCallback(() => {
    setSnapshot(createInitialSnapshot());
  }, []);

  const setSiteStatus = useCallback((id: SiteId, status: HealthStatus) => {
    setSnapshot((current) => applySiteStatus(current, id, status));
  }, []);

  const setLinkStatus = useCallback(
    (id: string, status: HealthStatus | undefined) => {
      setSnapshot((current) => ({
        ...current,
        links: current.links.map((link) =>
          link.id === id ? { ...link, status } : link,
        ),
      }));
    },
    [],
  );

  const cycleSiteStatus = useCallback((id: SiteId) => {
    setSnapshot((current) => {
      const site = current.sites.find((item) => item.id === id);
      if (!site) return current;
      return applySiteStatus(current, id, nextStatus(site.status));
    });
  }, []);

  const cycleLinkStatus = useCallback((id: string) => {
    setSnapshot((current) => ({
      ...current,
      links: current.links.map((link) => {
        if (link.id !== id) return link;
        const currentStatus = link.status ?? "up";
        return { ...link, status: nextStatus(currentStatus) };
      }),
    }));
  }, []);

  const advanceAgent = useCallback(() => {
    setSnapshot((current) => withAdvancedAgent(current));
  }, []);

  const sendFollowUp = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSnapshot((current) => ({
      ...current,
      agent: appendFollowUp(current.agent, trimmed),
    }));
  }, []);

  const value = useMemo(
    () => ({
      snapshot,
      reset,
      setSiteStatus,
      setLinkStatus,
      cycleSiteStatus,
      cycleLinkStatus,
      advanceAgent,
      sendFollowUp,
    }),
    [
      snapshot,
      reset,
      setSiteStatus,
      setLinkStatus,
      cycleSiteStatus,
      cycleLinkStatus,
      advanceAgent,
      sendFollowUp,
    ],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within DashboardProvider");
  }
  return context;
}
