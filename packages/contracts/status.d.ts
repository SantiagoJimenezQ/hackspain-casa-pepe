import type { CommandGuard } from './simulation';
/** Dummy AWS API contract. All timestamps are ISO 8601 UTC strings. */
export type ServiceHealth = 'healthy' | 'degraded' | 'unavailable';
import type { Dashboard } from './dashboard';
import type { SimulationState } from './simulation';
export interface StatusSnapshot extends Dashboard {
  simulation: SimulationState;
  simulated: true;
  runId: string;
  revision: number;
  updatedAt: string;
  region: string;
  status: ServiceHealth;
  incident: null | { id: string; status: 'active' | 'resolved'; startedAt: string; resolvedAt: string | null };
  services: { id: string; status: ServiceHealth; recoveryCapacityRequired: number }[];
  backup: { region: string; capacity: number };
  events: { id: string; runId: string; revision: number; occurredAt: string; simulationMinute: number; source: 'simulation'; type: string; detail: string | Record<string, string | number> }[];
}
export interface CapacityCommand extends CommandGuard { capacity: number }
export interface ServiceCommand extends CommandGuard { serviceId: string; status: ServiceHealth }
export interface ApiError { error: { code: string; message: string } }
