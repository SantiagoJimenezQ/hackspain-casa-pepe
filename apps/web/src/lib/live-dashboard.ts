import { recoveryStartTimes } from "@/lib/agent-trace";
import type { ActivityRecord, Incident, Overview, ServiceHealth } from "@/lib/casa-pepe-types";

export type VisualStatus = "up" | "degraded" | "down";
const visualStatus = (status: ServiceHealth): VisualStatus => status === "healthy" ? "up" : status === "recovering" ? "degraded" : status;

const UP_VALUES = new Set(["healthy", "completed", "approved", "recovered", "recuperado", "up", "verified", "succeeded"]);
const DOWN_VALUES = new Set(["down", "failed", "rejected", "cancelled"]);

export function statusOf(value: string): VisualStatus {
  const normalized = value.toLowerCase();
  if (UP_VALUES.has(normalized)) return "up";
  if (DOWN_VALUES.has(normalized)) return "down";
  return "degraded";
}

export function customerView(incident: Incident) {
  return (incident.customers ?? []).map((customer) => {
    const services = (incident.services ?? []).filter((service) => customer.serviceIdentifiers.includes(service.identifier));
    const healthy = services.filter((service) => service.status === "healthy").length;
    const active = services.some((service) => service.status === "recovering");
    const progress = services.length ? Math.round((healthy / services.length) * 100) : 0;
    const status: VisualStatus = services.some((service) => service.status === "down") ? "down" : services.some((service) => service.status !== "healthy") ? "degraded" : "up";
    const action = progress === 100 ? "recovered" as const : active || progress > 0 ? "migrating" as const : "queued" as const;
    return { ...customer, progress, status, action };
  });
}

export function customerViewOrdered(overview: Overview, activity: ReadonlyArray<ActivityRecord> = []) {
  const starts = recoveryStartTimes(overview, activity);
  return customerView(overview.incident)
    .map((customer, scenarioIndex) => {
      const times = customer.serviceIdentifiers.flatMap((identifier) => {
        const startedAt = starts.get(identifier);
        return startedAt === undefined ? [] : [startedAt];
      });
      return {
        customer,
        scenarioIndex,
        recoveryStartedAt: times.length ? Math.min(...times) : null,
      };
    })
    .toSorted((left, right) => {
      if (left.recoveryStartedAt !== null && right.recoveryStartedAt !== null) {
        if (left.recoveryStartedAt !== right.recoveryStartedAt) return left.recoveryStartedAt - right.recoveryStartedAt;
        return left.customer.identifier.localeCompare(right.customer.identifier);
      }
      if (left.recoveryStartedAt !== null) return -1;
      if (right.recoveryStartedAt !== null) return 1;
      return left.scenarioIndex - right.scenarioIndex;
    })
    .map((row) => ({ ...row.customer, recoveryStartedAt: row.recoveryStartedAt }));
}

export function topologyView(overview: Overview) {
  return overview.incident.topology?.nodes ?? [];
}

export function recoveryProgress(overview: Overview) {
  const services = overview.incident.services ?? [];
  const completed = services.filter((service) => service.status === "healthy" && overview.incident.status !== "normal").length;
  return { completed, total: services.length, percent: services.length ? Math.round((completed / services.length) * 100) : 0 };
}

export { visualStatus };
