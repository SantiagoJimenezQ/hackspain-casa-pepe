"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { CheckCircle2, Radio, RefreshCcw, Sparkles, Zap } from "lucide-react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher";
import { ThemeSwitcher } from "@/components/dashboard/theme-switcher";
import { Button } from "@/components/ui/button";
import { incidentClock } from "@/lib/agent-trace";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { overview, status, busyAction, triggerImpact, triggerTwist, resetDemo, resetLearnings, learningResetMessage } = useDashboard();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const live = status === "active";
  const clock = overview ? incidentClock(overview.incident, now?.getTime() ?? 0) : null;
  const elapsed = clock?.elapsed ?? "00:00";
  const recovered = Boolean(clock?.recovered);
  const impacted = Boolean(overview?.incident.impactedAt);
  const busy = busyAction !== null;
  return (
    <>
      <header className="flex min-h-14 flex-wrap py-2 shrink-0 items-center gap-4 border-b border-border bg-background/75 px-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-7 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-primary/30">
            <Image
              src="/agents/pepe.webp"
              alt="Pepe"
              width={192}
              height={172}
              className="size-full object-cover"
            />
          </span>
          <div>
            <p className="text-[14px] font-semibold tracking-tight text-foreground">Casa Pepe</p>
            <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">Incident coordination</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div
              className={cn(
                "rounded-md border px-2 py-1 text-center",
                recovered ? "border-status-up/40 bg-status-up/10" : "border-border bg-muted/30",
              )}
            >
              <p
                className={cn(
                  "flex items-center justify-center gap-1 font-mono text-[13px] leading-none tabular-nums",
                  recovered ? "text-status-up" : "text-foreground",
                )}
              >
                {recovered ? <CheckCircle2 className="size-3.5" /> : null}
                {elapsed}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[8px] tracking-[0.12em] uppercase",
                  recovered ? "text-status-up/80" : "text-muted-foreground",
                )}
              >
                {recovered ? "Resuelto" : "Tiempo de incidente"}
              </p>
            </div>
            <Button size="xs" variant="outline" onClick={() => void triggerImpact()} disabled={!live || busy || impacted || recovered}>
              <Zap /> Impacto
            </Button>
            <Button size="xs" variant="outline" onClick={() => void triggerTwist()} disabled={!live || busy}>
              <Sparkles /> Twist
            </Button>
            <Button size="xs" variant="outline" onClick={() => void resetLearnings()} disabled={!live || busy}
              title="Borra todos los aprendizajes guardados de ejecuciones anteriores. No reinicia el incidente actual.">
              <RefreshCcw /> {busyAction === "reset-learnings" ? "Borrando aprendizajes…" : "Borrar aprendizajes"}
            </Button>
            <Button size="xs" variant="outline" onClick={() => void resetDemo()} disabled={!live || busy}>
              <RefreshCcw /> Reiniciar
            </Button>
          </div>
          <div className="hidden items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground sm:flex">
            <Radio className={impacted ? "size-3 text-emerald-300" : "size-3"} />
            {impacted ? "ACTIVIDAD EN DIRECTO" : "EN ESPERA"}
          </div>
          <p className="hidden font-mono text-[11px] tabular-nums text-muted-foreground sm:block">
            {now?.toLocaleTimeString("es-ES") ?? "--:--:--"}
          </p>
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </header>
      {learningResetMessage ? <p role="status" className="border-b border-border px-4 py-2 text-xs text-muted-foreground">{learningResetMessage}</p> : null}
    </>
  );
}
