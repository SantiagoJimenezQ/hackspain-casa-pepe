"use client";

import { CapacityControls } from "@/components/dashboard/capacity-controls";
import Image from "next/image";
import { useEffect, useState } from "react";
import { CheckCircle2, Radio, RefreshCcw, RotateCcw, Sparkles, Zap } from "lucide-react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher";
import { ThemeSwitcher } from "@/components/dashboard/theme-switcher";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  const clearingLearnings = busyAction === "reset-learnings";
  return (
    <>
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background/75 px-3 py-2 backdrop-blur sm:px-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-7 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-primary/30">
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

        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-2.5 py-1 transition-colors sm:ml-2",
            recovered ? "border-status-up/45 bg-status-up/10" : "border-border bg-muted/40",
          )}
          title={recovered ? "Incidente resuelto" : "Tiempo desde el impacto"}
        >
          {recovered ? <CheckCircle2 className="size-4 shrink-0 text-status-up" /> : null}
          <div className="leading-none">
            <p
              className={cn(
                "font-mono text-[15px] leading-none font-semibold tabular-nums",
                recovered ? "text-status-up" : "text-foreground",
              )}
            >
              {elapsed}
            </p>
            <p
              className={cn(
                "mt-1 text-[8px] leading-none tracking-[0.12em] uppercase",
                recovered ? "text-status-up/80" : "text-muted-foreground",
              )}
            >
              {recovered ? "Resuelto" : "Tiempo de incidente"}
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1">
            <CapacityControls />
            <Button
              size="sm"
              variant={impacted || recovered ? "outline" : "default"}
              onClick={() => void triggerImpact()}
              disabled={!live || busy || impacted || recovered}
              title="Dispara el impacto del incidente y arranca al agente"
            >
              <Zap /> <span className="hidden lg:inline">Impacto</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void triggerTwist()}
              disabled={!live || busy}
              title="Inyecta un giro en el escenario en curso"
            >
              <Sparkles /> <span className="hidden lg:inline">Twist</span>
            </Button>
            <Separator orientation="vertical" className="mx-0.5 h-5 self-center" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void resetLearnings()}
              disabled={!live || busy}
              title="Borra todos los aprendizajes guardados de ejecuciones anteriores. No reinicia el incidente actual."
            >
              <RefreshCcw className={cn(clearingLearnings && "animate-spin")} />
              <span className="hidden xl:inline">
                {clearingLearnings ? "Borrando aprendizajes…" : "Borrar aprendizajes"}
              </span>
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void resetDemo()}
              disabled={!live || busy}
              title="Reinicia la demo al estado inicial"
            >
              <RotateCcw /> <span className="hidden lg:inline">Reiniciar</span>
            </Button>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <Separator orientation="vertical" className="h-6 self-center" />
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold tracking-[0.12em] transition-colors",
                impacted
                  ? "border-status-up/45 bg-status-up/10 text-status-up"
                  : "border-border bg-muted/30 text-muted-foreground",
              )}
            >
              <span className="relative flex size-1.5 shrink-0">
                {impacted ? <span className="absolute inset-0 animate-ping rounded-full bg-status-up/70" /> : null}
                <span className={cn("relative size-1.5 rounded-full", impacted ? "bg-status-up" : "bg-muted-foreground/60")} />
              </span>
              <Radio className="size-3" />
              {impacted ? "ACTIVIDAD EN DIRECTO" : "EN ESPERA"}
            </span>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {now?.toLocaleTimeString("es-ES") ?? "--:--:--"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>
      {learningResetMessage ? <p role="status" className="border-b border-border px-4 py-2 text-xs text-muted-foreground">{learningResetMessage}</p> : null}
    </>
  );
}
