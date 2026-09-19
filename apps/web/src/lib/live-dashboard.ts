import { recoveryStartTimes } from "@/lib/agent-trace";
import type { ActivityRecord, Incident, Overview, ServiceHealth } from "@/lib/casa-pepe-types";

export type VisualStatus = "up" | "degraded" | "down";
export type CustomerAction = "online" | "offline" | "migrating" | "recovered";
const visualStatus = (status: ServiceHealth): VisualStatus => status === "healthy" ? "up" : status === "recovering" ? "degraded" : status;

const UP_VALUES = new Set(["healthy", "completed", "approved", "recovered", "recuperado", "migrado", "migrated", "online", "operativo", "operational", "up", "verified", "succeeded"]);
const DOWN_VALUES = new Set(["down", "failed", "rejected", "cancelled", "offline", "sin conexión", "sin conexion"]);

export function statusOf(value: string): VisualStatus {
  const normalized = value.toLowerCase();
  if (UP_VALUES.has(normalized)) return "up";
  if (DOWN_VALUES.has(normalized)) return "down";
  return "degraded";
}

export function incidentImpacted(incident: Pick<Incident, "impactedAt" | "status">): boolean {
  if (incident.impactedAt) return true;
  const status = incident.status;
  return Boolean(status) && status !== "normal" && status !== "reset";
}

/**
 * The fixed recovery order by sector, mirroring CUSTOMER_SECTOR_PRIORITY on the server: health
 * first, then finance, then logistics, then every other sector. Names are listed in both
 * languages and compared without accents.
 */
const SECTOR_PRIORITY: ReadonlyArray<ReadonlyArray<string>> = [
  ["salud", "sanidad", "healthcare", "health"],
  ["fintech", "finanzas", "finance", "banca", "banking"],
  ["logistica", "logistics"],
];

function sectorRank(sector: string) {
  const normalized = sector.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  const tier = SECTOR_PRIORITY.findIndex((names) => names.includes(normalized));
  return tier === -1 ? SECTOR_PRIORITY.length : tier;
}

/** Recovered companies climb to the top of the board, still-offline ones sink to the bottom. */
const CUSTOMER_ACTION_RANK: Record<CustomerAction, number> = {
  recovered: 0,
  migrating: 1,
  online: 2,
  offline: 3,
};

export function customerActionStatus(action: CustomerAction): VisualStatus {
  if (action === "online" || action === "recovered") return "up";
  if (action === "migrating") return "degraded";
  return "down";
}

export function customerView(incident: Incident) {
  const impacted = incidentImpacted(incident);
  return (incident.customers ?? []).map((customer) => {
    const services = (incident.services ?? []).filter((service) => customer.serviceIdentifiers.includes(service.identifier));
    const healthy = services.filter((service) => service.status === "healthy").length;
    const active = services.some((service) => service.status === "recovering");
    const progress = services.length ? Math.round((healthy / services.length) * 100) : 0;
    const action: CustomerAction = !impacted && progress === 100
      ? "online"
      : progress === 100
        ? "recovered"
        : active
          ? "migrating"
          : "offline";
    return { ...customer, progress, status: customerActionStatus(action), action };
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
      const byAction = CUSTOMER_ACTION_RANK[left.customer.action] - CUSTOMER_ACTION_RANK[right.customer.action];
      if (byAction !== 0) return byAction;
      if (left.recoveryStartedAt !== null && right.recoveryStartedAt !== null) {
        if (left.recoveryStartedAt !== right.recoveryStartedAt) return left.recoveryStartedAt - right.recoveryStartedAt;
        return left.customer.identifier.localeCompare(right.customer.identifier);
      }
      if (left.recoveryStartedAt !== null) return -1;
      if (right.recoveryStartedAt !== null) return 1;
      // Nothing has started for either: they queue in the order recovery will take them.
      const bySector = sectorRank(left.customer.sector) - sectorRank(right.customer.sector);
      if (bySector !== 0) return bySector;
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
