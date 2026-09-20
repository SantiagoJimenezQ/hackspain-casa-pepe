import { Phone } from "lucide-react";
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
