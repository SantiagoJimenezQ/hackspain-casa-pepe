"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { casaPepeClient } from "@/lib/casa-pepe-client";
import type { DeliveryProbeResult, Overview } from "@/lib/casa-pepe-types";

export function DeliveryProbe() {
  const { overview, retry } = useDashboard();
  return overview ? <DeliveryProbeControl key={overview.incident.runIdentifier} overview={overview} refresh={retry} /> : null;
}

export function DeliveryProbeControl({ overview, refresh }: { overview: Overview; refresh: () => Promise<void> }) {
  const { locale } = useI18n(); const es = locale === "es";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DeliveryProbeResult | null>(null);
  const runIdentifier = overview.incident.runIdentifier;
  const supported = overview.agent.recoveryMode === "http" && overview.incident.active && overview.incident.runKind !== "replay" && overview.incident.simulation?.mode === "manual";
  const history = (overview.deliveryProbes ?? []).filter(item => item.runIdentifier === runIdentifier);
  const results = result && !history.some(item => item.checkedAt === result.checkedAt) ? [...history, result].slice(-2) : history;
  async function probe() {
    setBusy(true); setError("");
    try {
      setResult(await casaPepeClient.probeDelivery(runIdentifier));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (es ? "No se pudo realizar la prueba." : "Probe request failed."));
    } finally { setBusy(false); }
  }
  return <section aria-label={es ? "Prueba funcional" : "Functional check"} className="flex shrink-0 flex-col gap-2 border-t border-border px-3 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold">{es ? "Pedido de prueba" : "Test delivery"}</h3><p className="text-xs text-muted-foreground">{es ? "Entorno HTTP de demostración" : "HTTP demo environment"}</p></div>
      <Button size="sm" variant="outline" disabled={!supported || busy} onClick={() => void probe()}><FlaskConical data-icon="inline-start" />{busy ? (es ? "Probando…" : "Testing…") : (es ? "Probar servicio" : "Test service")}</Button>
    </div>
    {!supported ? <p className="text-xs text-muted-foreground">{es ? "Disponible con recuperación HTTP y escenario manual activo." : "Requires HTTP recovery and an active manual scenario."}</p> : null}
    <div aria-live="polite" className="flex flex-col gap-2">
      {results.map((item, index) => <div key={item.checkedAt} className="flex flex-col gap-1 text-xs">
        <p className={item.verified ? "font-medium text-status-up" : "font-medium text-status-down"}>{results.length > 1 && index === 0 ? (es ? "Prueba anterior: " : "Previous check: ") : (es ? "Última prueba: " : "Latest check: ")}{item.verified ? (es ? "Ruta asignada" : "Route assigned") : (es ? "Sin ruta válida" : "No valid route")}</p>
        {item.routeIdentifier ? <p className="break-all font-mono text-muted-foreground">{item.routeIdentifier}</p> : <p className="text-muted-foreground">{es ? item.detail : "The test delivery did not receive a valid route. Check the service and HTTP environment connection."}</p>}
        <p className="text-muted-foreground">{new Date(item.checkedAt).toLocaleTimeString(es ? "es-ES" : "en-GB")}</p>
      </div>)}
    </div>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
  </section>;
}
