import type { Incident, Overview, ServiceHealth } from "@/lib/casa-pepe-types";

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

export function topologyView(overview: Overview) {
  return overview.incident.topology?.nodes ?? [];
}

export function recoveryProgress(overview: Overview) {
  const services = overview.incident.services ?? [];
  const completed = services.filter((service) => service.status === "healthy" && overview.incident.status !== "normal").length;
  return { completed, total: services.length, percent: services.length ? Math.round((completed / services.length) * 100) : 0 };
}

export { visualStatus };
