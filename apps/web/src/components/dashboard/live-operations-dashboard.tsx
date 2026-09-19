"use client";

import { CircleDashed } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { AgentPanel } from "@/components/dashboard/agent-panel";
import { CrisisMap } from "@/components/dashboard/crisis-map";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { recoveryTimeline } from "@/lib/agent-trace";
import { customerViewOrdered, recoveryProgress, statusOf, topologyView, type VisualStatus } from "@/lib/live-dashboard";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { cn } from "@/lib/utils";

const COLORS: Record<VisualStatus, string> = { up: "#3ee08f", degraded: "#f5a524", down: "#f04444" };
const PHASE_LABEL = { recovering: "recuperando", recovered: "recuperado", queued: "en cola" } as const;
const ACTION_LABEL = { migrating: "migrando", queued: "en cola", recovered: "recuperado" } as const;

function Dot({ status }: { status: VisualStatus }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[status], boxShadow: `0 0 9px ${COLORS[status]}` }} />;
}

function Status({ value }: { value: string }) {
  const status = statusOf(value);
  return (
    <motion.span
      className="inline-flex items-center gap-1.5 text-[10px] capitalize"
      animate={{ color: COLORS[status] }}
      transition={{ duration: 0.35 }}
    >
      <Dot status={status} />
      {value.replaceAll("-", " ")}
    </motion.span>
  );
}

function Title({ children, meta }: { children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[13px] font-medium">{children}</h2>
      {meta}
    </div>
  );
}

function MapPanel() {
  const { overview } = useDashboard();
  if (!overview) return null;
  const primary = topologyView(overview).find((node) => node.role === "primary");
  const impacted = primary?.status === "down" || Boolean(overview.incident.impactedAt);
  const unhealthy = (overview.incident.services ?? []).filter((service) => service.status !== "healthy").length;
  return (
    <Panel className="relative min-h-[220px] overflow-hidden p-0">
      <CrisisMap overview={overview} />
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-md border border-border/80 bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
        <p className="text-[10px] font-semibold tracking-[.16em] text-muted-foreground uppercase">Topología operativa</p>
        <p className="mt-1 text-[13px]">{impacted ? "Golfo · failover activo" : "En espera del impacto"}</p>
        <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
          <span>{unhealthy} servicios</span>
          <span>{overview.incident.region}</span>
          <span>→ {overview.incident.backupRegion}</span>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><Dot status="up" />operativo</span>
        <span className="flex items-center gap-1"><Dot status="degraded" />limitado</span>
        <span className="flex items-center gap-1"><Dot status="down" />impactado</span>
      </div>
      {impacted ? <span className="pointer-events-none absolute right-4 bottom-4 z-10 text-[10px] font-semibold tracking-[.12em] text-red-400 uppercase">impacto confirmado</span> : null}
    </Panel>
  );
}

function Companies() {
  const { overview, activity } = useDashboard();
  const { ref: scrollRef, className: scrollFadeClass } = useScrollFade();
  if (!overview) return null;
  const customers = customerViewOrdered(overview, activity);
  return (
    <Panel className="min-h-0">
      <div className="px-4 pt-3">
        <Title meta={<span className="text-[10px] text-muted-foreground">{customers.length} cuentas</span>}>Empresas afectadas</Title>
      </div>
      <div ref={scrollRef} className={cn(scrollFadeClass, "min-h-0 flex-1 overflow-auto px-2 pb-2")}>
        <table className="w-full text-left text-[11px]">
          <thead className="text-[10px] text-muted-foreground">
            <tr>
              <th className="px-2 pb-2">Empresa</th>
              <th className="px-2 pb-2">Sector</th>
              <th className="px-2 pb-2">Estado</th>
              <th className="px-2 pb-2 text-right">Usuarios</th>
            </tr>
          </thead>
          <tbody>
            <LayoutGroup>
              <AnimatePresence initial={false}>
                {customers.map((customer) => (
                  <motion.tr
                    key={customer.identifier}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, backgroundColor: customer.action === "recovered" ? "color-mix(in srgb, var(--status-up) 8%, transparent)" : "transparent" }}
                    transition={{ duration: 0.4, layout: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } }}
                    className="border-t border-border"
                  >
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        {customer.logo ? (
                          <span
                            className="size-5 shrink-0 rounded-sm bg-cover bg-center"
                            style={{ backgroundImage: `url(${customer.logo})` }}
                            aria-hidden
                          />
                        ) : (
                          <span className="inline-flex size-5 items-center justify-center rounded-sm text-[9px] font-bold text-white" style={{ background: customer.accent }}>
                            {customer.shortName[0]}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium">{customer.name}</p>
                          <p className="text-[10px] text-muted-foreground">{customer.city ?? customer.sector}</p>
                          {customer.action !== "recovered" ? (
                            <div className="mt-1 h-0.5 w-20 overflow-hidden rounded-full bg-muted">
                              <motion.div className="h-full bg-status-degraded" animate={{ width: `${customer.progress}%` }} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{customer.sector}</td>
                    <td className="px-2 py-2"><Status value={ACTION_LABEL[customer.action]} /></td>
                    <td className="px-2 py-2 text-right tabular-nums">{customer.users.toLocaleString("es-ES")}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </LayoutGroup>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Recovery() {
  const { overview, activity } = useDashboard();
  const { ref: scrollRef, className: scrollFadeClass } = useScrollFade<HTMLOListElement>();
  if (!overview) return null;
  const recovery = recoveryProgress(overview);
  const items = recoveryTimeline(overview, activity);
  return (
    <Panel className="min-h-0 p-4">
      <Title meta={<span className="text-[10px] text-muted-foreground">{recovery.completed}/{recovery.total}</span>}>Progreso de recuperación</Title>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <motion.div className="h-full rounded-full bg-status-up" animate={{ width: `${recovery.percent}%` }} transition={{ duration: 0.5 }} />
        </div>
        <span className="text-[12px] font-medium">{recovery.percent}%</span>
      </div>
      <ol ref={scrollRef} className={cn(scrollFadeClass, "min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1")}>
        <AnimatePresence initial={false}>
          {items.length ? items.map((item) => (
            <motion.li
              key={item.identifier}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-2"
            >
              <Status value={PHASE_LABEL[item.phase]} />
              <span className="min-w-0 flex-1 truncate text-[11px]">{item.name}</span>
              <span className="font-mono text-[9px] text-muted-foreground">{item.capacityUnits}u</span>
            </motion.li>
          )) : (
            <li className="text-[11px] text-muted-foreground">Esperando el primer ciclo del agente.</li>
          )}
        </AnimatePresence>
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
    <div className="min-h-0 flex-1 overflow-hidden p-3">
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.45fr)_minmax(420px,.9fr)] gap-3">
        <div className="grid min-h-0 grid-rows-[minmax(220px,1.2fr)_minmax(0,1fr)] gap-3">
          <MapPanel />
          <div className="grid min-h-0 grid-cols-[1.2fr_1fr] gap-3">
            <Companies />
            <Recovery />
          </div>
        </div>
        <AgentPanel />
      </div>
    </div>
  );
}
