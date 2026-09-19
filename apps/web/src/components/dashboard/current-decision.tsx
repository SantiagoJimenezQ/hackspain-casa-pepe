"use client";
import { useI18n } from "@/components/i18n/locale-provider";
import type { Overview } from "@/lib/casa-pepe-types";

export function CurrentDecision({ overview }: { overview: Overview }) {
 const { locale }=useI18n(); const es=locale === "es";
 const plan=overview.plan.kind === "plan" ? overview.plan.plan : null;
 if(!plan) return null;
 const step=plan.steps.find(s=>s.status === "running") ?? plan.steps.find(s=>s.status === "awaiting-approval") ?? plan.steps.find(s=>s.status === "approved");
 const outcome=overview.agent.lastCycleOutcome;
 const waiting=outcome?.reason || outcome?.waitingFor?.join(" · ");
 return <section aria-label={es ? "Decisión actual" : "Current decision"} className="space-y-2 border-t border-border px-4 py-3 text-xs">
  <p className="font-medium">{step ? `${step.status === "awaiting-approval" ? (es ? "Espera aprobación" : "Awaiting approval") : step.status === "running" ? (es ? "En curso" : "In progress") : (es ? "Aprobado" : "Approved")}: ${step.title}` : plan.summary}</p>
  <p>{step?.reason || plan.reason}</p>
  {step ? <p className="text-muted-foreground">{es ? "Responsable" : "Owner"}: {step.owner.name}</p> : null}
  {!overview.agent.cycleInProgress && waiting ? <p className="text-muted-foreground">{waiting}</p> : null}
  <p className="text-muted-foreground">{es ? "Capacidad prevista" : "Planned capacity"}: {plan.capacity.plannedUnits}/{plan.capacity.assumedCapacity} · {plan.capacity.confirmed ? (es ? "confirmada" : "confirmed") : (es ? "sin confirmar" : "unconfirmed")}</p>
  {plan.changesFromPrevious.map((change,i)=><p key={i}>{es ? "Cambio" : "Change"}: {change.description}</p>)}
  <details><summary className="cursor-pointer text-muted-foreground">{es ? "Orden de prioridad" : "Priority order"}</summary>
   <p className="mt-2">{plan.reason}</p>
   {plan.priorities.map(priority => <p key={priority.serviceIdentifier} className="mt-2"><span className="font-medium">{priority.rank}. {priority.serviceName}</span> · {priority.decision}<span className="block">{priority.reason}</span>{priority.blockedBy.length ? <span className="block text-muted-foreground">{es ? "Depende de" : "Depends on"}: {priority.blockedBy.join(", ")}</span> : null}</p>)}
  </details>
  <details><summary className="cursor-pointer text-muted-foreground">{es ? "Hechos y supuestos" : "Facts and assumptions"}</summary>
   {overview.incident.facts.map(fact=><p key={fact.identifier} className="mt-2">{fact.statement}<span className="block text-muted-foreground">{fact.status} · {fact.source} · {fact.recordedAt}</span></p>)}
   {plan.assumptions.map((assumption,i)=><p key={i} className="mt-2">{es ? "Supuesto" : "Assumption"}: {assumption}</p>)}
  </details>
 </section>;
}
