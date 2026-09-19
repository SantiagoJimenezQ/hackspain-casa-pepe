"use client";

import { useEffect, useState } from "react";
import { Activity, Radio, RefreshCcw, Sparkles, Zap } from "lucide-react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { ThemeSwitcher } from "@/components/dashboard/theme-switcher";
import { Button } from "@/components/ui/button";
import { crisisStartedAt, formatElapsed } from "@/lib/agent-trace";

export function TopBar() {
  const { overview, status, busyAction, triggerImpact, triggerTwist, resetDemo } = useDashboard();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const live = status === "active";
  const elapsed = live && overview && now
    ? formatElapsed(crisisStartedAt(overview.incident), now.getTime())
    : "00:00";
  const busy = busyAction !== null;
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/75 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
          <Activity className="size-4" />
        </span>
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-foreground">Casa Pepe</p>
          <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">Incident coordination</p>
        </div>
      </div>
      <div className="ml-3 hidden min-w-0 flex-1 items-center gap-2 md:flex">
        <span className={live ? "size-1.5 animate-pulse rounded-full bg-emerald-400" : "size-1.5 rounded-full bg-muted-foreground"} />
        <span className="truncate text-[11px] text-muted-foreground">
          {live ? `${overview?.incident.company} · ${overview?.incident.region} → ${overview?.incident.backupRegion}` : "Preparado para iniciar una simulación"}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {live ? (
          <div className="flex items-center gap-2">
            <div className="rounded-md border border-border bg-muted/30 px-2 py-1 text-center">
              <p className="font-mono text-[13px] leading-none tabular-nums text-foreground">{elapsed}</p>
              <p className="mt-0.5 text-[8px] tracking-[0.12em] text-muted-foreground uppercase">Tiempo de incidente</p>
            </div>
            <Button size="xs" variant="outline" onClick={() => void triggerImpact()} disabled={busy}>
              <Zap /> Impacto
            </Button>
            <Button size="xs" variant="outline" onClick={() => void triggerTwist()} disabled={busy}>
              <Sparkles /> Twist
            </Button>
            <Button size="xs" variant="outline" onClick={() => void resetDemo()} disabled={busy}>
              <RefreshCcw /> Reiniciar
            </Button>
          </div>
        ) : null}
        <div className="hidden items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground sm:flex">
          <Radio className={live ? "size-3 text-emerald-300" : "size-3"} />
          {live ? "ACTIVIDAD EN DIRECTO" : "SIN EJECUCIÓN"}
        </div>
        <p className="hidden font-mono text-[11px] tabular-nums text-muted-foreground sm:block">
          {now?.toLocaleTimeString("es-ES") ?? "--:--:--"}
        </p>
        <ThemeSwitcher />
      </div>
    </header>
  );
}
