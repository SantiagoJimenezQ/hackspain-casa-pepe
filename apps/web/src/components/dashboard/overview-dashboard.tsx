"use client";

import { AgentPanel } from "@/components/dashboard/agent/agent-panel";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { IncidentCard } from "@/components/dashboard/incident-card";
import { InfrastructureCard } from "@/components/dashboard/infrastructure-card";
import { MigrationCard } from "@/components/dashboard/migration-card";
import { SpainMap } from "@/components/dashboard/spain-map";

export function OverviewDashboard() {
  return (
    <div className="flex min-h-0 flex-1 gap-3 p-3">
      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3">
        <div className="grid min-h-0 grid-cols-[minmax(280px,0.92fr)_minmax(0,1.15fr)] gap-3">
          <IncidentCard />
          <SpainMap />
        </div>
        <div className="grid min-h-0 grid-cols-[1.2fr_1fr] gap-3">
          <CompaniesTable />
          <MigrationCard />
        </div>
        <InfrastructureCard />
      </div>
      <div className="flex min-h-0 w-[440px] shrink-0 flex-col">
        <AgentPanel />
      </div>
    </div>
  );
}
