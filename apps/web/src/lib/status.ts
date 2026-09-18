import type { HealthStatus } from "@/lib/dashboard-types";

export const STATUS_HEX: Record<HealthStatus, string> = {
  up: "#3ee08f",
  degraded: "#f5a524",
  down: "#f04444",
};
