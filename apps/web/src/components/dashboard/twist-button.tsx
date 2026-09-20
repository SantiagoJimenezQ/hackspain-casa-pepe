"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TwistButton({ disabled, onTrigger }: { disabled: boolean; onTrigger: () => void }) {
  const { locale } = useI18n();
  const es = locale === "es";
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const helpId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  function cancelHold() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  return (
    <Tooltip open={open} onOpenChange={setOpen} triggerId={triggerId}>
      <TooltipTrigger
        id={triggerId}
        aria-describedby={open ? helpId : undefined}
        delay={500}
        closeOnClick={false}
        render={<Button size="sm" variant="secondary" aria-label={es ? "Recortar capacidad" : "Cut capacity"} aria-disabled={disabled} className="aria-disabled:opacity-50" />}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          cancelHold();
          held.current = false;
          timer.current = setTimeout(() => {
            held.current = true;
            setOpen(true);
          }, 500);
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onBlur={cancelHold}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          cancelHold();
          if (held.current && event.detail !== 0) {
            held.current = false;
            event.preventDefault();
            return;
          }
          held.current = false;
          setOpen(false);
          if (!disabled) onTrigger();
        }}
      >
        <Sparkles /> <span className="hidden lg:inline">{es ? "Recortar capacidad" : "Cut capacity"}</span>
      </TooltipTrigger>
      <TooltipContent id={helpId} role="tooltip" side="bottom" sideOffset={8}>
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{es ? "¿Qué hace recortar capacidad?" : "What does cutting capacity do?"}</p>
          <p>
            {es
              ? "Plataforma informa de la capacidad real: la región de respaldo se queda en una sola unidad de cómputo en vez de las cuatro que muestra el panel. El agente descubre que su plan ya no cabe y tiene que repriorizar sobre otra región."
              : "Platform reports the real capacity: the backup region drops to a single compute unit instead of the four the dashboard shows. The agent finds its plan no longer fits and has to reprioritise onto another region."}
          </p>
          <p>
            {es
              ? "Pulsa para aplicarlo. Mantén pulsado para ver esta ayuda."
              : "Press to apply it. Hold to see this help."}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
