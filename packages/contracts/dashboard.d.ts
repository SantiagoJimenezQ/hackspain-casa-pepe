import type { CommandGuard } from './simulation';
import type { ServiceHealth } from './status';
export interface Region {
  id: string; name: string; latitude: number; longitude: number;
  role: 'primary' | 'backup'; status: ServiceHealth;
  /** Company hosting slots, including reservations for running migrations. */
  capacity: number; allocated: number; available: number;
}
export interface Company {
  id: string; name: string; users: number; priority: number;
  priorityReason: string; homeRegionId: string; regionId: string;
  status: ServiceHealth; migrationId: string | null;
}
export interface Migration {
  id: string; companyId: string; sourceRegionId: string; targetRegionId: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled'; progress: number;
  durationMinutes: number; etaMinutes: number | null; failureReason: string | null;
  startedAt: string; completedAt: string | null;
}
export interface Dashboard {
  regions: Region[]; companies: Company[]; migrations: Migration[];
  summary: {
    totalCompanies: number; totalUsers: number; affectedCompanies: number; affectedUsers: number;
    online: number; degraded: number; offline: number; companiesOnlinePercent: number;
    migration: { total: number; running: number; succeeded: number; failed: number; cancelled: number; progressPercent: number };
  };
  agent: { simulated: true; status: 'idle' | 'awaiting_action' | 'recovering' | 'monitoring'; currentAction: string; lastEventId: string | null };
}
export interface RegionCommand extends CommandGuard { regionId: string; status?: ServiceHealth; capacity?: number }
export interface StartMigrationCommand extends CommandGuard { companyId: string; targetRegionId: string }
export type UpdateMigrationCommand = CommandGuard & ({ migrationId: string; progress: number } | { migrationId: string; failureReason: string });
export interface RestoreCompanyCommand extends CommandGuard { companyId: string }
