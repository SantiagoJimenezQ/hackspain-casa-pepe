"use client";

import { BookOpen, RefreshCcw, Trash2 } from "lucide-react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const kinds: Record<string, string> = {
  "capacity-overstated": "Capacidad sobreestimada",
  "recovery-outcome": "Resultado de recuperación",
};

export function LearningPanel() {
  const { insights, learningLoading, learningError, refreshLearning, resetLearnings, busyAction, learningResetMessage } = useDashboard();
  const clearing = busyAction === "reset-learnings";

  return (
    <Sheet onOpenChange={(open) => { if (open) void refreshLearning(); }}>
      <SheetTrigger render={<Button size="sm" variant="outline" />}>
        <BookOpen /> <span className="hidden lg:inline">Aprendizajes</span>
      </SheetTrigger>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="pr-12">
          <SheetTitle>Aprendizajes del agente</SheetTitle>
          <SheetDescription>
            Memoria guardada del escenario, acumulada entre ejecuciones.
            El agente la usa como contexto y vuelve a comprobar el estado actual antes de actuar.
          </SheetDescription>
        </SheetHeader>
        <div className="flex items-center justify-between gap-3 px-4">
          <p className="text-xs text-muted-foreground">
            {learningLoading ? "Cargando aprendizajes…" : learningError ? "Memoria sin actualizar" : `${insights.length} aprendizajes guardados`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" disabled={learningLoading} onClick={() => void refreshLearning()}>
              <RefreshCcw /> Actualizar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              disabled={clearing || insights.length === 0}
              aria-label="Borrar todos los aprendizajes"
              title="Borra todos los aprendizajes guardados de ejecuciones anteriores. No reinicia el incidente actual."
              onClick={() => void resetLearnings()}
            >
              <Trash2 className={clearing ? "animate-pulse" : undefined} />
            </Button>
          </div>
        </div>
        {learningResetMessage ? (
          <p role="status" className="px-4 text-xs text-muted-foreground">{learningResetMessage}</p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" aria-busy={learningLoading}>
          {learningError ? <p role="alert" className="mb-4 text-sm text-destructive">{learningError}</p> : null}
          {!learningLoading && !learningError && insights.length === 0 ? (
            <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              Todavía no hay aprendizajes guardados. Aparecerán cuando el agente detecte diferencias de capacidad o registre resultados de recuperación.
            </p>
          ) : null}
          <ul className="flex flex-col gap-3">
            {insights.map((insight) => (
              <li key={insight.identifier} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{kinds[insight.kind] ?? insight.kind}</p>
                  <h3 className="break-words font-medium">{insight.subject}</h3>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{insight.summary}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{insight.observations} {insight.observations === 1 ? "observación" : "observaciones"}</span>
                  <span>Actualizado: <time dateTime={insight.updatedAt}>{new Date(insight.updatedAt).toLocaleString("es-ES")}</time></span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
