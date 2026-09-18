"use client";

import Link from "next/link";
import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { infraStatusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";

export function InfrastructureCard() {
  const { snapshot } = useDashboard();

  return (
    <Panel className="min-h-0 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-white">Infraestructura</h2>
        <Link
          href="/infraestructura"
          className="text-[11px] text-muted-foreground hover:text-white"
        >
          Ver todo
        </Link>
      </div>
      <ul className="space-y-1.5">
        {snapshot.infrastructure.map((node) => (
          <li key={node.id} className="flex items-center gap-2 text-[12px]">
            <span
              className={cn(
                "size-1.5 rounded-full",
                node.status === "down" && "bg-status-down",
                node.status === "degraded" && "bg-status-degraded",
                node.status === "up" && "bg-status-up",
              )}
            />
            <span className="flex-1 text-white">{node.name}</span>
            <span
              className={cn(
                "min-w-24 text-right",
                node.status === "down" ? "text-red-400" : "text-muted-foreground",
              )}
            >
              {infraStatusLabel(node.status)}
            </span>
            <span
              className={cn(
                "w-10 text-right tabular-nums",
                node.status === "down" ? "text-red-400" : "text-white",
              )}
            >
              {node.capacity}%
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
