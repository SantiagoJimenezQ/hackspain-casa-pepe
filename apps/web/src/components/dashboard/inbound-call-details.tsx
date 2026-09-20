"use client";

import { Popover } from "@base-ui/react/popover";
import { CircleHelp, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";

export function InboundCallDetails({ callCode, phoneNumber, available, locale }: {
  callCode?: string;
  phoneNumber?: string;
  available: boolean;
  locale: Locale;
}) {
  const spanish = locale === "es";
  const code = callCode?.replace(/^(\d{3})(\d{3})$/, "$1 $2");
  const validNumber = phoneNumber && /^\+[1-9]\d{6,14}$/.test(phoneNumber);
  return (
    <section aria-label={spanish ? "Llamar al coordinador" : "Call the coordinator"} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-muted/30 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <Phone aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">{spanish ? "Llama al agente" : "Call the agent"}</span>
        {validNumber ? <a href={`tel:${phoneNumber}`} className="font-mono font-semibold underline underline-offset-4">{phoneNumber}</a> : <span>{spanish ? "Número no disponible" : "Number unavailable"}</span>}
        <Popover.Root>
          <Popover.Trigger render={<Button variant="ghost" size="icon-sm" />} aria-label={spanish ? "Cómo priorizar una empresa" : "How to prioritize a company"}>
            <CircleHelp aria-hidden="true" className="size-4" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={8} align="start" className="z-50">
              <Popover.Popup className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-md outline-none">
                <Popover.Title className="font-semibold">
                  {spanish ? "Prioriza una empresa por teléfono" : "Prioritize a company by phone"}
                </Popover.Title>
                <Popover.Description className="text-muted-foreground">
                  {spanish
                    ? "Llama al número que aparece junto al icono de teléfono para solicitar que se dé prioridad a una empresa en la recuperación."
                    : "Call the number beside the phone icon to request priority for a company in the recovery."}
                </Popover.Description>
                {available && code && validNumber ? (
                  <p>{spanish
                    ? `Di al agente el código del incidente ${code}, el nombre de la empresa y por qué necesita prioridad.`
                    : `Tell the agent the incident code ${code}, the company name, and why it needs priority.`}</p>
                ) : (
                  <p>{spanish
                    ? "Necesitas un incidente activo sin resolver, su código y un número disponible para hacer la solicitud."
                    : "You need an active, unresolved incident, its code, and an available phone number to make a request."}</p>
                )}
                <Popover.Close render={<Button variant="outline" size="sm" />}>
                  {spanish ? "Entendido" : "Got it"}
                </Popover.Close>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{spanish ? "Código del incidente" : "Incident code"}</span>
        <strong className="font-mono text-base tracking-widest tabular-nums">{code || "—"}</strong>
      </div>
      <p className="text-xs text-muted-foreground">
        {available && code
          ? (spanish ? "Di este código y la empresa que necesitas priorizar." : "Say this code and the company you need prioritized.")
          : (spanish ? "La solicitud requiere un incidente activo sin resolver." : "Requests require an active, unresolved incident.")}
      </p>
    </section>
  );
}
