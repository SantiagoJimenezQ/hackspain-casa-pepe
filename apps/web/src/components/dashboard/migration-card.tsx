"use client";

import { Panel } from "@/components/dashboard/panel";
import { AgentStatusIcon, statusLabelClass } from "@/components/dashboard/agent/agent-status-icon";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { agentPhaseKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function MigrationCard() {
  const { snapshot } = useDashboard();
  const { t } = useI18n();
  const migrating = snapshot.companies.filter(
    (company) => company.action === "migrating",
  ).length;
  const total = snapshot.companies.length;
  const overall = snapshot.migrationOverallPercent;
  const phases = snapshot.agent.phases;

  return (
    <Panel className="min-h-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium text-foreground">
          {t("migration.title")}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {t("migration.doneOf", { done: migrating, total })}
        </span>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-status-up transition-[width] duration-300"
            style={{ width: `${overall}%` }}
          />
        </div>
        <span className="text-[12px] font-medium tabular-nums text-foreground">
          {overall}%
        </span>
      </div>
      <ol className="scroll-fade min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
        {phases.map((phase) => (
          <li key={phase.id} className="flex items-center gap-2.5 text-[12px]">
            <AgentStatusIcon status={phase.status} />
            <span
              className={cn(
                "flex-1",
                phase.status === "pending"
                  ? "text-muted-foreground"
                  : "text-foreground",
                phase.status === "running" && "shimmer",
              )}
            >
              {t(agentPhaseKey(phase.id))}
            </span>
            <span
              className={cn(
                "text-[11px] tabular-nums",
                statusLabelClass(phase.status),
              )}
            >
              {phase.status === "running"
                ? t("agent.step.running")
                : phase.status === "pending"
                  ? t("agent.step.pending")
                  : phase.time}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
