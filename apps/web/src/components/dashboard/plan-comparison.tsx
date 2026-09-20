"use client";

import { ArrowRightLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { PlanComparison as Comparison, PlanComparisonSnapshot } from "@/lib/casa-pepe-types";

export function PlanComparison({ comparison }: { comparison: Comparison }) {
  const { locale } = useI18n(); const es = locale === "es";
  const { previous, current } = comparison;
  const changedIds = current.priorities.filter(priority => {
    const before = previous?.priorities.find(item => item.serviceIdentifier === priority.serviceIdentifier);
    return before && (before.decision !== priority.decision || before.rank !== priority.rank);
  }).map(priority => priority.serviceIdentifier);
  const focusIds = (changedIds.length ? changedIds : current.priorities.map(priority => priority.serviceIdentifier)).slice(0, 3);
  return <Sheet>
    <div className="flex shrink-0 flex-col gap-2 px-4 pb-3">
      <SheetTrigger render={<Button variant="outline" className="w-full justify-start gap-2" />}>
        <ArrowRightLeft data-icon="inline-start" />
        <span className="min-w-0 flex-1 truncate text-left">
          {previous ? (es ? "Comparar planes" : "Compare plans") : (es ? "Ver plan y motivos" : "View plan and reasons")}
        </span>
        {previous ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            v{previous.version} → v{current.version}
          </span>
        ) : null}
        <ChevronRight data-icon="inline-end" className="shrink-0 text-muted-foreground" />
      </SheetTrigger>
      {previous ? <p className="text-xs text-muted-foreground">{comparison.capacityChanges.at(-1)?.reason || current.reason}</p> : null}
    </div>
    <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-5xl overflow-y-auto">
      <SheetHeader>
        <SheetTitle>{previous ? (es ? "El plan ha cambiado" : "The plan has changed") : (es ? "Plan de recuperación" : "Recovery plan")}</SheetTitle>
        <SheetDescription>{comparison.trigger || current.summary}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-6">
        {comparison.capacityChanges.map((change, index) => <Alert key={`${change.occurredAt}-${index}`}>
          <AlertTitle>{change.resourceName}: <span className="text-2xl tabular-nums">{change.previousCapacity ?? "?"} → {change.totalCapacity}</span> {es ? "unidades" : "units"}</AlertTitle>
          <AlertDescription>{change.reason}</AlertDescription>
        </Alert>)}
        {comparison.supersededApprovals.map(approval => <Alert key={approval.identifier}>
          <AlertTitle>{es ? "Aprobación anterior invalidada" : "Previous approval invalidated"}</AlertTitle>
          <AlertDescription><p>{approval.actionSummary}</p><p>{approval.reason}</p></AlertDescription>
        </Alert>)}
        <div className="grid gap-4 md:grid-cols-2">
          {previous ? <PlanSnapshot focusIds={focusIds} plan={previous} label={es ? "Antes" : "Before"} /> : null}
          <PlanSnapshot focusIds={focusIds} plan={current} label={es ? "Ahora" : "Now"} />
        </div>
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">{es ? "Por qué este plan" : "Why this plan"}</h3>
          <p className="text-sm leading-relaxed">{current.reason}</p>
          {comparison.changes.length ? <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">{comparison.changes.map((change, index) => <li key={`${change.kind}-${index}`}>{change.description}</li>)}</ul> : null}
        </section>

      </div>
    </SheetContent>
  </Sheet>;
}

function PlanSnapshot({ plan, label, focusIds }: { plan: PlanComparisonSnapshot; label: string; focusIds: string[] }) {
  const { locale } = useI18n(); const es = locale === "es";
  const decisions: Record<string, string> = es ? { "recover-now": "Recuperar", postpone: "Posponer", "already-healthy": "Operativo", "waiting-for-dependency": "Espera dependencia" } : { "recover-now": "Recover", postpone: "Postpone", "already-healthy": "Healthy", "waiting-for-dependency": "Waiting for dependency" };
  return <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
    <header className="flex items-center justify-between"><h3 className="text-lg font-semibold">{label}</h3><Badge variant="secondary">v{plan.version}</Badge></header>

    <div className="flex flex-col gap-1"><p className="text-sm font-medium">{plan.resourceName}</p><p className="text-2xl font-semibold tabular-nums">{plan.plannedUnits} / {plan.totalCapacity}<span className="ml-2 text-xs font-normal text-muted-foreground">{es ? "unidades previstas / totales" : "planned / total units"}</span></p></div>
    <ol className="flex flex-col gap-3">
      {[...plan.priorities].filter(priority => focusIds.includes(priority.serviceIdentifier)).sort((a, b) => a.rank - b.rank).map(priority => <li key={priority.serviceIdentifier} className="flex flex-col gap-1 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{priority.rank}. {priority.serviceName}</p><Badge variant="outline">{decisions[priority.decision] ?? priority.decision}</Badge></div>
        <p className="text-sm leading-relaxed text-muted-foreground">{priority.reason}</p>
        {priority.blockedBy.length ? <p className="text-xs">{es ? "Depende de" : "Depends on"}: {priority.blockedBy.map(id => plan.priorities.find(item => item.serviceIdentifier === id)?.serviceName ?? id).join(", ")}</p> : null}
      </li>)}
    </ol>
    <details><summary className="cursor-pointer text-sm">{es ? "Resumen y todas las prioridades" : "Summary and all priorities"}</summary><p className="mt-3 text-sm">{plan.summary}</p><ol className="mt-3 flex flex-col gap-2 text-sm">{[...plan.priorities].sort((a,b) => a.rank-b.rank).map(priority => <li key={priority.serviceIdentifier}><strong>{priority.rank}. {priority.serviceName}</strong> · {decisions[priority.decision] ?? priority.decision}<p className="text-muted-foreground">{priority.reason}</p></li>)}</ol></details>
    <details><summary className="cursor-pointer text-sm">{es ? "Orden de ejecución y motivos" : "Execution order and reasons"}</summary><ol className="mt-3 flex flex-col gap-3 text-sm">{[...plan.steps].sort((a,b) => a.order-b.order).map(step => <li key={`${step.order}-${step.title}`}><strong>{step.order}. {step.title}</strong><p className="text-muted-foreground">{step.reason}</p></li>)}</ol></details>
  </section>;
}
