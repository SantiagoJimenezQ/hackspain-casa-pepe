"use client";

import { Check } from "lucide-react";
import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { cn } from "@/lib/utils";

export function MigrationCard() {
  const { snapshot } = useDashboard();
  const done = snapshot.companies.filter(
    (company) => company.migrationProgress >= 100,
  ).length;
  const total = snapshot.companies.length;
  const overall = snapshot.migrationOverallPercent;

  return (
    <Panel className="min-h-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium text-white">Progreso de migración</h2>
        <span className="text-[11px] text-muted-foreground">
          {done} de {total} empresas
        </span>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-status-up"
            style={{ width: `${overall}%` }}
          />
        </div>
        <span className="text-[12px] font-medium text-white">{overall}%</span>
      </div>
      <ul className="space-y-2.5">
        {snapshot.companies.map((company) => (
          <li key={company.id} className="grid grid-cols-[18px_86px_1fr_auto] items-center gap-2">
            <span
              className="flex size-[18px] items-center justify-center rounded-[4px] text-[9px] font-bold text-white"
              style={{ backgroundColor: company.accent }}
            >
              {company.shortName.slice(0, 1)}
            </span>
            <span className="truncate text-[12px] text-white">{company.shortName}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-status-up"
                style={{ width: `${company.migrationProgress}%` }}
              />
            </div>
            <span
              className={cn(
                "min-w-16 text-right text-[11px]",
                company.migrationProgress >= 100
                  ? "text-status-up"
                  : "text-muted-foreground",
              )}
            >
              {company.migrationProgress >= 100 ? (
                <span className="inline-flex items-center justify-end gap-1">
                  100%
                  <Check className="size-3.5" />
                </span>
              ) : company.etaMinutes ? (
                `ETA ${company.etaMinutes} min`
              ) : (
                "En cola"
              )}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
