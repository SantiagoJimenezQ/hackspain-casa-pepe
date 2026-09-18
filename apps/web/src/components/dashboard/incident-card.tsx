"use client";

import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";

export function IncidentCard() {
  const { snapshot } = useDashboard();
  const { incident } = snapshot;

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-red-400">
          <span className="size-2 rounded-full bg-status-down shadow-[0_0_10px_#f04444]" />
          INCIDENTE CRÍTICO
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <p>{incident.localTime}</p>
          <p>{incident.elapsedLabel}</p>
        </div>
      </div>
      <h1 className="text-[28px] leading-8 font-semibold tracking-tight text-white">
        {incident.title}
      </h1>
      <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
        {incident.description}
      </p>
    </Panel>
  );
}
