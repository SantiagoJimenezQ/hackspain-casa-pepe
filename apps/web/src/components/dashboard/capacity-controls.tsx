"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { casaPepeClient } from "@/lib/casa-pepe-client";
import type { Incident } from "@/lib/casa-pepe-types";

export function CapacityControls() {
  const { overview, busyAction, retry } = useDashboard();
  const { locale } = useI18n();
  const es = locale === "es";
  return <Sheet>
    <SheetTrigger render={<Button size="sm" variant="outline" disabled={!overview || busyAction !== null} />}>
      <SlidersHorizontal data-icon="inline-start" /> <span className="hidden lg:inline">{es ? "Capacidad" : "Capacity"}</span>
    </SheetTrigger>
    <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl overflow-y-auto">
      <SheetHeader>
        <SheetTitle>{es ? "Capacidad de los datacenters" : "Datacenter capacity"}</SheetTitle>
        <SheetDescription>{es ? "Control del escenario simulado. Cada cambio registra el motivo y solicita al agente que reevalúe el plan." : "Simulated scenario control. Each change records its reason and asks the agent to reassess the plan."}</SheetDescription>
      </SheetHeader>
      {overview ? <CapacityForm key={overview.incident.runIdentifier} incident={overview.incident} refresh={retry} /> : null}
    </SheetContent>
  </Sheet>;
}

export function CapacityForm({ incident, refresh }: { incident: Incident; refresh: () => Promise<void> }) {
  const { locale } = useI18n();
  const es = locale === "es";
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function apply(resource: Incident["resources"][number]) {
    const totalCapacity = Number(drafts[resource.identifier]);
    setBusy(resource.identifier); setError(""); setMessage("");
    try {
      await casaPepeClient.changeCapacity({ runIdentifier: incident.runIdentifier, resourceIdentifier: resource.identifier, totalCapacity, reason: reason.trim() });
      setMessage(`${resource.name}: ${resource.totalCapacity} → ${totalCapacity}. ${es ? "Cambio registrado." : "Change recorded."}`);
      setDrafts(current => { const next = { ...current }; delete next[resource.identifier]; return next; });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (es ? "No se pudo cambiar la capacidad." : "Capacity change failed."));
    } finally { setBusy(null); }
  }
  return <div className="flex flex-col gap-5 px-4 pb-6">
    <label className="flex flex-col gap-2 text-sm" htmlFor="capacity-reason">
      {es ? "Motivo del cambio" : "Reason for change"}
      <Input id="capacity-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} placeholder={es ? "Ej.: mantenimiento imprevisto" : "E.g. unexpected maintenance"} />
    </label>
    {incident.resources.map(resource => {
      const raw = drafts[resource.identifier] ?? String(resource.totalCapacity);
      const value = Number(raw);
      const invalid = raw.trim() === "" || !Number.isSafeInteger(value) || value < resource.allocatedCapacity;
      return <fieldset key={resource.identifier} className="flex flex-col gap-3 rounded-lg border border-border p-4" disabled={busy !== null || !incident.active || incident.runKind === "replay"}>
        <legend className="px-1 text-sm font-semibold">{resource.name}</legend>
        <p className="text-xs text-muted-foreground">{resource.region} · {resource.allocatedCapacity} {es ? "asignadas" : "allocated"} · {resource.totalCapacity - resource.allocatedCapacity} {es ? "libres" : "free"}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm" htmlFor={`capacity-${resource.identifier}`}>
            {es ? "Capacidad total" : "Total capacity"} · {es ? "ahora" : "now"} {resource.totalCapacity}
            <Input
              id={`capacity-${resource.identifier}`}
              aria-label={`${es ? "Capacidad total" : "Total capacity"}: ${resource.name}`}
              type="number"
              min={resource.allocatedCapacity}
              step={1}
              value={raw}
              aria-invalid={invalid}
              // The value is typed and applied with the button, so the native stepper is noise.
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              onChange={event => setDrafts(current => ({ ...current, [resource.identifier]: event.target.value }))}
            />
          </label>
          <Button onClick={() => void apply(resource)} disabled={invalid || value === resource.totalCapacity || !reason.trim()}>
            {busy === resource.identifier ? (es ? "Aplicando…" : "Applying…") : (es ? "Aplicar cambio" : "Apply change")}
          </Button>
        </div>
        {invalid ? <p role="alert" className="text-xs text-destructive">{es ? `Introduce un entero de al menos ${resource.allocatedCapacity} unidades asignadas.` : `Enter an integer of at least ${resource.allocatedCapacity} allocated units.`}</p> : null}
      </fieldset>;
    })}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
  </div>;
}
