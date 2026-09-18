import type { HealthStatus } from "@/lib/dashboard-types";

export const STATUS_HEX: Record<HealthStatus, string> = {
  up: "var(--status-up)",
  degraded: "var(--status-degraded)",
  down: "var(--status-down)",
};
