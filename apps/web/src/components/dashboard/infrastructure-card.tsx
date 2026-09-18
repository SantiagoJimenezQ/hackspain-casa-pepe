"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { infraKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { HealthStatus } from "@/lib/dashboard-types";

export function InfrastructureCard() {
  const { snapshot } = useDashboard();
  const { t } = useI18n();

  return (
    <Panel className="shrink-0 px-4 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-foreground">
          {t("infra.title")}
        </h2>
        <Link
          href="/infraestructura"
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("infra.seeAll")}
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="scroll-fade-x flex gap-2 overflow-x-auto pb-0.5">
        {snapshot.infrastructure.map((node) => (
          <div
            key={node.id}
            className="min-w-[148px] shrink-0 rounded-lg border border-border/80 px-3 py-2"
          >
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  node.status === "down" && "bg-status-down",
                  node.status === "degraded" && "bg-status-degraded",
                  node.status === "up" && "bg-status-up",
                )}
              />
              {t(infraKey(node.id))}
            </div>
            <p
              className={cn(
                "mt-1 pl-3 text-[11px]",
                node.status === "down" ? "text-status-down" : "text-status-up",
                node.status === "degraded" && "text-status-degraded",
              )}
            >
              {infraStatus(t, node.status)}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function infraStatus(
  t: ReturnType<typeof useI18n>["t"],
  status: HealthStatus,
) {
  if (status === "down") return t("status.infra.down");
  if (status === "degraded") return t("status.infra.degraded");
  return t("status.infra.up");
}
