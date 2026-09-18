import type { HealthStatus } from "@/lib/dashboard-types";

export const STATUS_HEX: Record<HealthStatus, string> = {
  up: "#3ee08f",
  degraded: "#f5a524",
  down: "#f04444",
};

export function companyStatusLabel(status: HealthStatus) {
  if (status === "down") return "Caída total";
  if (status === "degraded") return "Degradado";
  return "Operativo";
}

export function infraStatusLabel(status: HealthStatus) {
  if (status === "down") return "Fuera de servicio";
  if (status === "degraded") return "Degradado";
  return "Operativo";
}

export function mapStatusLabel(status: HealthStatus) {
  if (status === "down") return "Sin conexión";
  if (status === "degraded") return "Degradado";
  return "Conectado";
}
