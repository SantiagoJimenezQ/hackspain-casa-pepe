"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DemoDrawer } from "@/components/dashboard/demo-drawer";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher";
import { ThemeSwitcher } from "@/components/dashboard/theme-switcher";
import { useI18n } from "@/components/i18n/locale-provider";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MessageKey } from "@/lib/i18n";

const NAV: { href: string; labelKey: MessageKey }[] = [
  { href: "/", labelKey: "nav.overview" },
  { href: "/incidentes", labelKey: "nav.incidents" },
  { href: "/migracion", labelKey: "nav.migration" },
  { href: "/empresas", labelKey: "nav.companies" },
  { href: "/infraestructura", labelKey: "nav.infrastructure" },
  { href: "/logs", labelKey: "nav.logs" },
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
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        Casa Pepe
      </span>
    </Link>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const { locale, t } = useI18n();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-border px-4">
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
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(item.labelKey)}
              {active ? (
                <span className="absolute inset-x-3 -bottom-[13px] h-px bg-foreground" />
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/8 px-3 py-1">
          <span className="size-1.5 rounded-full bg-status-up shadow-[0_0_8px_var(--status-up)]" />
          <div className="leading-tight">
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-200">
              {t("agent.online")}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {t("agent.resolving")}
            </p>
          </div>
        </div>
        <div className="text-right leading-tight">
          <p className="text-[11px] text-muted-foreground">
            {now ? formatDate(now, locale) : "—"}
          </p>
          <p className="font-mono text-[13px] tabular-nums text-foreground">
            {now ? formatTime(now, locale) : "--:--:--"}
          </p>
        </div>
        <ThemeSwitcher />
        <LanguageSwitcher />
        <DemoDrawer />
        <Avatar className="size-8 ring-1 ring-border">
          <AvatarFallback className="bg-muted text-[11px] font-semibold text-foreground">
            N
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
