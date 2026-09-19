"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/locale-provider";
import type { Decision } from "@/lib/agent-decisions";

export function DecisionCard({ decision }: { decision: Decision }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { locale } = useI18n();
  const es = locale === "es";
  const labels = es
    ? { draft: "Borrador", pending: "Validando", accepted: "Decisión aceptada", rejected: "Rechazada", stale: "Descartada: cambió la situación", incomplete: "Respuesta incompleta" }
    : { draft: "Draft", pending: "Validating", accepted: "Decision accepted", rejected: "Rejected", stale: "Discarded: situation changed", incomplete: "Incomplete response" };
  return <article className="my-2 min-w-0 rounded-lg border border-border bg-muted/25 p-3 text-xs" aria-label={es ? "Decisión del agente" : "Agent decision"}>
    <div className="mb-2 font-medium">{labels[decision.disposition]}</div>
    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground">{decision.text || (es ? "No se proporcionó explicación." : "No explanation provided.")}</p>
    {decision.actionResult ? <p className="mt-2 font-medium">{decision.actionResult.dispatchStatus === "blocked" ? (es ? "Plan guardado; acción bloqueada" : "Plan saved; action blocked") : decision.actionResult.dispatchStatus === "awaiting-approval" ? (es ? "Esperando aprobación" : "Awaiting approval") : decision.actionResult.dispatchStatus === "failed" ? (es ? "La acción falló" : "Action failed") : (es ? "Acción enviada; pendiente de resultado/verificación" : "Action dispatched; awaiting result/verification")}{decision.actionResult.reason ? `: ${decision.actionResult.reason}` : ""}</p> : null}
    {decision.reason ? <p className="mt-2 text-muted-foreground">{decision.reason}</p> : null}
    {decision.disposition === "accepted" ? <p className="mt-2 text-[11px] text-muted-foreground">{es ? "La ejecución y la verificación se muestran por separado." : "Execution and verification are shown separately."}</p> : null}
    {decision.redacted ? <p className="mt-2 text-muted-foreground">{es ? "Datos sensibles ocultos" : "Sensitive data redacted"}</p> : null}
    {decision.toolCalls.length ? <div className="mt-2"><button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)} className="cursor-pointer text-muted-foreground">{es ? "Acción propuesta · detalles" : "Proposed action · details"}</button>{detailsOpen ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(decision.toolCalls, null, 2)}</pre> : null}</div> : null}
  </article>;
}
