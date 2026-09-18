"use client";

import { AffectedSummaryCard } from "@/components/dashboard/affected-summary-card";
import { AgentCard } from "@/components/dashboard/agent-card";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { GlobalStatusCard } from "@/components/dashboard/global-status-card";
import { IncidentCard } from "@/components/dashboard/incident-card";
import { InfrastructureCard } from "@/components/dashboard/infrastructure-card";
import { LiveCameraCard } from "@/components/dashboard/live-camera-card";
import { MigrationCard } from "@/components/dashboard/migration-card";
import { SpainMap } from "@/components/dashboard/spain-map";

export function OverviewDashboard() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_320px] gap-3">
        <div className="flex min-h-0 flex-col gap-3">
          <IncidentCard />
          <GlobalStatusCard />
          <AffectedSummaryCard />
        </div>
        <SpainMap />
        <div className="flex min-h-0 flex-col gap-3">
          <LiveCameraCard />
          <AgentCard />
        </div>
      </div>
      <div className="grid h-[258px] shrink-0 grid-cols-[1.25fr_1fr_0.86fr] gap-3">
        <CompaniesTable />
        <MigrationCard />
        <InfrastructureCard />
      </div>
    </div>
  );
}
