"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DemoDrawer } from "@/components/dashboard/demo-drawer";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { formatEsDate, formatEsTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Visión general" },
  { href: "/incidentes", label: "Incidentes" },
  { href: "/migracion", label: "Migración" },
  { href: "/empresas", label: "Empresas" },
  { href: "/infraestructura", label: "Infraestructura" },
  { href: "/logs", label: "Logs" },
];

function CasaPepeMark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 pr-4">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
          <path
            d="M10 2.2 17.5 16H2.5L10 2.2Z"
            fill="currentColor"
            opacity="0.95"
          />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-white">
        Casa Pepe
      </span>
    </Link>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const { snapshot } = useDashboard();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-white/8 px-4">
      <CasaPepeMark />
      <nav className="flex min-w-0 flex-1 items-center gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative rounded-md px-3 py-1.5 text-[13px] transition-colors",
                active
                  ? "text-white"
                  : "text-muted-foreground hover:text-white",
              )}
            >
              {item.label}
              {active ? (
                <span className="absolute inset-x-3 -bottom-[13px] h-px bg-white" />
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/8 px-3 py-1">
          <span className="size-1.5 rounded-full bg-status-up shadow-[0_0_8px_#3ee08f]" />
          <div className="leading-tight">
            <p className="text-[11px] font-medium text-emerald-200">
              Agente IA activo
            </p>
            <p className="text-[10px] text-muted-foreground">
              {snapshot.agent.statusLabel}
            </p>
          </div>
        </div>
        <div className="text-right leading-tight">
          <p className="text-[11px] text-muted-foreground">
            {now ? formatEsDate(now) : "—"}
          </p>
          <p className="font-mono text-[13px] tabular-nums text-white">
            {now ? formatEsTime(now) : "--:--:--"}
          </p>
        </div>
        <DemoDrawer />
        <Avatar className="size-8 ring-1 ring-white/10">
          <AvatarFallback className="bg-[#1b2538] text-[11px] font-semibold text-white">
            N
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
