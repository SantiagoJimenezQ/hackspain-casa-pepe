"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Play, RefreshCcw, Sparkles, Zap } from "lucide-react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function DemoDrawer() {
  const [open, setOpen] = useState(false);
  const { overview, status, busyAction, startDemo, triggerImpact, triggerTwist, resetDemo, runAgentCycle } = useDashboard();
  const ready = status === "ready";
  const busy = busyAction !== null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "d" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      event.preventDefault(); setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <Sheet open={open} onOpenChange={setOpen}><Button variant="outline" size="sm" className="h-7 border-border bg-muted/50 text-[11px] text-muted-foreground" onClick={() => setOpen(true)}><FlaskConical /> Demo</Button><SheetContent side="right" className="w-[380px] border-border bg-popover p-0 sm:max-w-[380px]"><SheetHeader className="border-b border-border"><SheetTitle>Controles de demo</SheetTitle><SheetDescription>Escenario español · pulsa D para abrir o cerrar</SheetDescription></SheetHeader><div className="space-y-5 overflow-y-auto p-4"><section className="rounded-lg border border-primary/20 bg-primary/5 p-3"><p className="text-[11px] font-semibold tracking-wide text-primary uppercase">Estado del entorno</p><p className="mt-2 text-[13px] text-foreground">{overview ? overview.incident.title : ready ? "Sin ejecución activa" : "Conectando con el backend"}</p><p className="mt-1 text-[11px] text-muted-foreground">{overview ? `Run ${overview.incident.runIdentifier}` : "El inicio crea meteorite-eu-west-1-es."}</p></section><section><h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Secuencia de demostración</h3><div className="grid gap-2"><Button variant="outline" onClick={() => void startDemo()} disabled={busy || !ready}><Play /> {busyAction === "start" ? "Iniciando…" : "1. Iniciar escenario"}</Button><Button variant="outline" onClick={() => void triggerImpact()} disabled={busy || !overview}><Zap /> {busyAction === "impact" ? "Aplicando…" : "2. Introducir impacto"}</Button><Button variant="outline" onClick={() => void triggerTwist()} disabled={busy || !overview}><Sparkles /> {busyAction === "twist" ? "Replanificando…" : "3. Reducir capacidad"}</Button><Button variant="outline" onClick={() => void runAgentCycle()} disabled={busy || !overview}><Play /> {busyAction === "cycle" ? "Solicitando…" : "4. Pedir ciclo al agente"}</Button><Button variant="outline" onClick={() => void resetDemo()} disabled={busy || !overview}><RefreshCcw /> {busyAction === "reset" ? "Reiniciando…" : "Reiniciar ejecución"}</Button></div></section><p className="rounded-md bg-muted/60 p-3 text-[11px] leading-5 text-muted-foreground">Las aprobaciones aparecen en el panel principal cuando el agente solicita una acción de riesgo. Las llamadas, herramientas y verificaciones se actualizan en directo.</p></div></SheetContent></Sheet>;
}
