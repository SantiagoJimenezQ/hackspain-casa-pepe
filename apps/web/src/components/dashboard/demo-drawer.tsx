"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { STATUS_HEX, mapStatusLabel } from "@/lib/status";
import type { HealthStatus } from "@/lib/dashboard-types";

export function DemoDrawer() {
  const [open, setOpen] = useState(false);
  const {
    snapshot,
    reset,
    cycleSiteStatus,
    cycleLinkStatus,
    advanceAgent,
  } = useDashboard();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "d" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      event.preventDefault();
      setOpen((current) => !current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        className="h-7 border-white/10 bg-white/4 text-[11px] text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        Demo
      </Button>
      <SheetContent
        side="right"
        className="w-[380px] border-white/10 bg-[#101826] p-0 sm:max-w-[380px]"
      >
        <SheetHeader className="border-b border-white/8">
          <SheetTitle>Controles de demo</SheetTitle>
          <SheetDescription>
            Atajo <kbd className="rounded bg-white/8 px-1">D</kbd>. Estos
            controles prueban el mapa y el agente hasta que exista el backend.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 overflow-y-auto p-4">
          <section className="space-y-2">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Escenario
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                Reiniciar
              </Button>
              <Button variant="outline" size="sm" disabled>
                Iniciar escenario
              </Button>
              <Button variant="outline" size="sm" disabled>
                Inyectar giro
              </Button>
              <Button variant="outline" size="sm" onClick={advanceAgent}>
                Avanzar agente
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" disabled>
                Aprobar
              </Button>
              <Button variant="outline" size="sm" disabled>
                Rechazar
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Centros de datos
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Pulsa para ciclar verde → ámbar → rojo.
            </p>
            <ul className="space-y-1.5">
              {snapshot.sites.map((site) => (
                <li key={site.id}>
                  <button
                    type="button"
                    onClick={() => cycleSiteStatus(site.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-white/4"
                  >
                    <StatusDot status={site.status} />
                    <span className="flex-1 text-white">{site.name}</span>
                    <span className="text-muted-foreground">
                      {mapStatusLabel(site.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Enlaces
            </h3>
            <ul className="space-y-1.5">
              {snapshot.links.map((link) => {
                const from = snapshot.sites.find((site) => site.id === link.from);
                const to = snapshot.sites.find((site) => site.id === link.to);
                const status = link.status ?? from?.status ?? "up";
                return (
                  <li key={link.id}>
                    <button
                      type="button"
                      onClick={() => cycleLinkStatus(link.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-white/4"
                    >
                      <StatusDot status={status} />
                      <span className="flex-1 text-white">
                        {from?.name} → {to?.name}
                      </span>
                      <span className="text-muted-foreground">
                        {link.status ? mapStatusLabel(link.status) : "heredado"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatusDot({ status }: { status: HealthStatus }) {
  return (
    <span
      className="size-2.5 rounded-full"
      style={{ backgroundColor: STATUS_HEX[status] }}
    />
  );
}
