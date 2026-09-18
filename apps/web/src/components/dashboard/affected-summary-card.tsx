"use client";

import type { ReactNode } from "react";
import { Building2, Users } from "lucide-react";
import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { formatEsNumber } from "@/lib/format";

const COMPANY_SPARK = "1,28 12,24 24,26 36,22 48,18 60,16 72,12 84,8 96,4";
const USER_SPARK = "1,26 12,24 24,23 36,21 48,18 60,14 72,11 84,8 96,5";

export function AffectedSummaryCard() {
  const { snapshot } = useDashboard();
  const { impact } = snapshot;

  return (
    <Panel className="min-h-0 flex-1 p-4">
      <h2 className="text-[13px] font-medium text-white">Empresas afectadas</h2>
      <div className="mt-4 space-y-4">
        <ImpactRow
          icon={<Building2 className="size-4" />}
          value={`${impact.companiesOffline} / ${impact.companiesTotal}`}
          label="Empresas offline"
          delta={impact.companiesDeltaPercent}
          spark={COMPANY_SPARK}
        />
        <ImpactRow
          icon={<Users className="size-4" />}
          value={formatEsNumber(impact.usersOffline)}
          label="Usuarios sin servicio"
          delta={impact.usersDeltaPercent}
          spark={USER_SPARK}
        />
      </div>
    </Panel>
  );
}

function ImpactRow({
  icon,
  value,
  label,
  delta,
  spark,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  delta: number;
  spark: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-white/4 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[18px] font-semibold text-white">{value}</p>
          <span className="text-[11px] font-medium text-red-400">↑ {delta}%</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
      <svg viewBox="0 0 100 32" className="h-8 w-20 overflow-visible">
        <polyline
          points={spark}
          fill="none"
          stroke="#f04444"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
