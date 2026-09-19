"use client";

import { CircleDashed } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ActiveCallBanner } from "@/components/dashboard/active-call-banner";
import { AgentPanel } from "@/components/dashboard/agent-panel";
import { CrisisMap } from "@/components/dashboard/crisis-map";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/locale-provider";
import { recoveryTimeline, type RecoveryPhase } from "@/lib/agent-trace";
import { agentSettled } from "@/lib/crisis-map";
import {
  customerActionStatus,
  customerViewOrdered,
  incidentImpacted,
  recoveryProgress,
  topologyView,
  type CustomerAction,
  type VisualStatus,
} from "@/lib/live-dashboard";
import type { MessageKey } from "@/lib/i18n";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { cn } from "@/lib/utils";

const COLORS: Record<VisualStatus, string> = { up: "#3ee08f", degraded: "#f5a524", down: "#f04444" };
const ACTION_LABEL: Record<CustomerAction, MessageKey> = {
  online: "status.company.up",
  offline: "companies.offline",
  migrating: "companies.migrating",
  recovered: "companies.migrated",
};
const PHASE_LABEL = {
  recovering: "companies.migrating",
  recovered: "companies.migrated",
  offline: "companies.offline",
} as const satisfies Record<string, MessageKey>;
const COMPANY_GRID = "grid grid-cols-[minmax(0,1.6fr)_minmax(0,.9fr)_auto] gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,.9fr)_minmax(0,.8fr)_auto]";
const ACTION_ROW: Record<CustomerAction, string> = {
  online: "border-border bg-muted/20",
  recovered: "border-[color-mix(in_srgb,var(--status-up)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-up)_10%,transparent)]",
  migrating: "border-[color-mix(in_srgb,var(--status-degraded)_40%,transparent)] bg-[color-mix(in_srgb,var(--status-degraded)_10%,transparent)]",
  offline: "border-[color-mix(in_srgb,var(--status-down)_28%,transparent)] bg-[color-mix(in_srgb,var(--status-down)_7%,transparent)]",
};
const ACTION_ACCENT: Record<CustomerAction, string> = {
  online: "var(--status-up)",
  recovered: "var(--status-up)",
  migrating: "var(--status-degraded)",
  offline: "var(--status-down)",
};
const PHASE_ROW: Record<RecoveryPhase, string> = {
  recovered: "border-[color-mix(in_srgb,var(--status-up)_35%,transparent)] bg-[color-mix(in_srgb,var(--status-up)_10%,transparent)]",
  recovering: "border-[color-mix(in_srgb,var(--status-degraded)_40%,transparent)] bg-[color-mix(in_srgb,var(--status-degraded)_10%,transparent)]",
  offline: "border-[color-mix(in_srgb,var(--status-down)_28%,transparent)] bg-[color-mix(in_srgb,var(--status-down)_7%,transparent)]",
};
const PHASE_ACCENT: Record<RecoveryPhase, string> = {
  recovered: "var(--status-up)",
  recovering: "var(--status-degraded)",
  offline: "var(--status-down)",
};

function Dot({ status }: { status: VisualStatus }) {
  return (
    <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle, ${COLORS[status]} 28%, transparent 70%)` }}
      />
      <span className="relative size-2 rounded-full" style={{ backgroundColor: COLORS[status] }} />
    </span>
  );
}

function Status({ label, status }: { label: string; status: VisualStatus }) {
  return (
    <motion.span
      className="inline-flex items-center gap-1.5 text-[10px]"
      animate={{ color: COLORS[status] }}
      transition={{ duration: 0.35 }}
    >
      <Dot status={status} />
      {label}
    </motion.span>
  );
}

function Title({ children, meta, className }: { children: React.ReactNode; meta?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-2", className)}>
      <h2 className="text-[13px] font-medium">{children}</h2>
      {meta}
    </div>
  );
}

function MapPanel() {
  const { overview } = useDashboard();
  const { t } = useI18n();
  if (!overview) return null;
  const primary = topologyView(overview).find((node) => node.role === "primary");
  const impacted = primary?.status === "down" || Boolean(overview.incident.impactedAt);
  const settled = agentSettled(overview);
  const unhealthy = (overview.incident.services ?? []).filter((service) => service.status !== "healthy").length;
  const headline = settled ? t("map.networkRestored") : impacted ? t("map.networkCrisis") : t("map.networkLive");
  return (
    <Panel className="relative min-h-[220px] overflow-hidden p-0">
      <CrisisMap overview={overview} />
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-md border border-border/80 bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
        <p className="text-[10px] font-semibold tracking-[.16em] text-muted-foreground uppercase">Topología operativa</p>
        <p className="mt-1 text-[13px]">{headline}</p>
        <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
          <span>{unhealthy} servicios</span>
          <span>{overview.incident.region}</span>
          <span>→ {overview.incident.backupRegion}</span>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><Dot status="up" />{t("map.legendOnline")}</span>
        <span className="flex items-center gap-1"><Dot status="degraded" />{t("map.legendMigrating")}</span>
        <span className="flex items-center gap-1"><Dot status="down" />{t("map.legendOffline")}</span>
      </div>
      {impacted && !settled ? (
        <span className="pointer-events-none absolute right-4 bottom-4 z-10 text-[10px] font-semibold tracking-[.12em] text-red-400 uppercase">
          {t("map.impactConfirmed")}
        </span>
      ) : null}
    </Panel>
  );
}

function Companies() {
  const { overview, activity } = useDashboard();
  const { t } = useI18n();
  const { ref: scrollRef, className: scrollFadeClass } = useScrollFade<HTMLUListElement>();
  if (!overview) return null;
  const customers = customerViewOrdered(overview, activity);
  const impacted = incidentImpacted(overview.incident);
  return (
    <Panel className="min-h-[260px] xl:min-h-0">
      <div className="px-4 pt-3">
        <Title
          className="mb-2"
          meta={
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              {t("companies.accounts", { count: customers.length })}
            </span>
          }
        >
          {impacted ? t("companies.title") : t("companies.titleIdle")}
        </Title>
      </div>
      <div className={cn(COMPANY_GRID, "px-5.5 pb-1.5 text-[9px] tracking-[.12em] text-muted-foreground uppercase")}>
        <span>{t("companies.company")}</span>
        <span className="hidden sm:block">{t("companies.sector")}</span>
        <span>{t("companies.status")}</span>
        <span className="text-right">{t("companies.users")}</span>
      </div>
      <ul ref={scrollRef} className={cn(scrollFadeClass, "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3")}>
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {customers.map((customer) => (
              <motion.li
                key={customer.identifier}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, layout: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } }}
                className={cn(
                  COMPANY_GRID,
                  "min-h-11 shrink-0 items-center rounded-lg border border-l-2 px-2.5 py-1.5 text-[11px]",
                  ACTION_ROW[customer.action],
                )}
                style={{ borderLeftColor: ACTION_ACCENT[customer.action] }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {customer.logo ? (
                    <span
                      className="size-5 shrink-0 rounded-md bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${customer.logo})` }}
                      aria-hidden
                    />
                  ) : (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white" style={{ background: customer.accent }}>
                      {customer.shortName[0]}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{customer.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{customer.city ?? customer.sector}</p>
                    {customer.action === "online" || customer.action === "recovered" ? null : (
                      <div className="mt-1 h-0.5 w-20 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className={cn("h-full", customer.action === "migrating" ? "bg-status-degraded" : "bg-status-down")}
                          animate={{ width: `${customer.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <span className="hidden truncate text-muted-foreground sm:block">{customer.sector}</span>
                <Status label={t(ACTION_LABEL[customer.action])} status={customerActionStatus(customer.action)} />
                <span className="text-right tabular-nums">{customer.users.toLocaleString("es-ES")}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </LayoutGroup>
      </ul>
    </Panel>
  );
}

function Recovery() {
  const { overview, activity } = useDashboard();
  const { t } = useI18n();
  const { ref: scrollRef, className: scrollFadeClass } = useScrollFade<HTMLOListElement>();
  if (!overview) return null;
  const recovery = recoveryProgress(overview);
  const items = recoveryTimeline(overview, activity);
  const complete = recovery.total > 0 && recovery.completed === recovery.total;
  return (
    <Panel className="min-h-[260px] xl:min-h-0">
      <div className="px-4 pt-3">
        <Title
          className="mb-2"
          meta={
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              {recovery.completed}/{recovery.total}
            </span>
          }
        >
          {t("migration.title")}
        </Title>
      </div>
      <div className="flex items-center gap-3 px-4 pb-2.5">
        <motion.span
          className="font-mono text-[22px] leading-none font-semibold tabular-nums"
          animate={{ color: complete ? COLORS.up : "var(--foreground)" }}
          transition={{ duration: 0.4 }}
        >
          {recovery.percent}%
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[9px] leading-none text-muted-foreground">
            {t("migration.servicesDone", { done: recovery.completed, total: recovery.total })}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${COLORS.up} 55%, transparent), ${COLORS.up})` }}
              animate={{ width: `${recovery.percent}%` }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            />
          </div>
        </div>
      </div>
      <ol ref={scrollRef} className={cn(scrollFadeClass, "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3")}>
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.li
                key={item.identifier}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, layout: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } }}
                className={cn(
                  "flex min-h-7 flex-1 basis-0 items-center gap-2.5 overflow-hidden rounded-md border border-l-2 px-2.5 py-1",
                  PHASE_ROW[item.phase],
                )}
                style={{ borderLeftColor: PHASE_ACCENT[item.phase] }}
              >
                <Dot status={item.status} />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{item.name}</span>
                <motion.span
                  className="shrink-0 text-[10px] font-medium"
                  animate={{ color: COLORS[item.status] }}
                  transition={{ duration: 0.35 }}
                >
                  {t(PHASE_LABEL[item.phase])}
                </motion.span>
                <span className="shrink-0 rounded border border-border/70 bg-background/40 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
                  {item.capacityUnits}u
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </LayoutGroup>
        {items.length ? null : (
          <li className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border px-3 text-[11px] text-muted-foreground">
            {t("migration.waiting")}
          </li>
        )}
      </ol>
    </Panel>
  );
}

export function LiveOperationsDashboard() {
  const { status, overview, error, retry, busyAction } = useDashboard();
  if (status === "error" && !overview) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Panel className="max-w-xl p-8">
          <p className="text-[11px] tracking-[.16em] text-primary uppercase">Casa Pepe · Centro de mando</p>
          <h1 className="mt-3 text-3xl font-semibold">No se puede alcanzar al coordinador</h1>
          <p className="mt-3 text-sm text-muted-foreground">{error ?? "No se pudo contactar con el backend de Casa Pepe."}</p>
          <Button className="mt-6" onClick={() => void retry()} disabled={busyAction !== null}>
            Reintentar
          </Button>
        </Panel>
      </div>
    );
  }
  if (!overview) {
    return <div className="flex flex-1 items-center justify-center"><CircleDashed className="size-6 animate-spin" /></div>;
  }
  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto p-3 xl:overflow-hidden">
      <ActiveCallBanner />
      <div className="grid min-h-0 gap-3 xl:h-full xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,.9fr)]">
        <div className="grid min-h-0 gap-3 xl:grid-rows-[minmax(220px,1.2fr)_minmax(0,1fr)]">
          <MapPanel />
          <div className="grid min-h-0 gap-3 lg:grid-cols-[1.2fr_1fr]">
            <Companies />
            <Recovery />
          </div>
        </div>
        <AgentPanel />
      </div>
    </div>
  );
}
