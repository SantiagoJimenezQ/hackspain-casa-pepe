"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TwistButton({ disabled, onTrigger }: { disabled: boolean; onTrigger: () => void }) {
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
        render={<Button size="sm" variant="secondary" aria-label="Twist" aria-disabled={disabled} className="aria-disabled:opacity-50" />}
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
        <Sparkles /> <span className="hidden lg:inline">Twist</span>
      </TooltipTrigger>
      <TooltipContent id={helpId} role="tooltip" side="bottom" sideOffset={8}>
        <div className="flex flex-col gap-1">
          <p className="font-semibold">¿Qué hace Twist?</p>
          <p>Introduce un imprevisto: reduce la capacidad disponible en la región de respaldo y obliga al agente a revisar las prioridades y adaptar el plan de recuperación.</p>
          <p>Pulsa para aplicarlo. Mantén pulsado para ver esta ayuda.</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
