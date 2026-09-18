"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { siteKey } from "@/lib/i18n";
import { STATUS_HEX } from "@/lib/status";
import type { HealthStatus } from "@/lib/dashboard-types";

export function DemoDrawer() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
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
        className="h-7 border-border bg-muted/50 text-[11px] text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        Demo
      </Button>
      <SheetContent
        side="right"
        className="w-[380px] border-border bg-popover p-0 sm:max-w-[380px]"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>{t("demo.title")}</SheetTitle>
          <SheetDescription>{t("demo.description", { key: "D" })}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 overflow-y-auto p-4">
          <section className="space-y-2">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {t("demo.scenario")}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                {t("demo.reset")}
              </Button>
              <Button variant="outline" size="sm" disabled>
                {t("demo.start")}
              </Button>
              <Button variant="outline" size="sm" disabled>
                {t("demo.twist")}
              </Button>
              <Button variant="outline" size="sm" onClick={advanceAgent}>
                {t("demo.advance")}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" disabled>
                {t("demo.approve")}
              </Button>
              <Button variant="outline" size="sm" disabled>
                {t("demo.reject")}
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {t("demo.sites")}
            </h3>
            <p className="text-[11px] text-muted-foreground">{t("demo.cycleHint")}</p>
            <ul className="space-y-1.5">
              {snapshot.sites.map((site) => (
                <li key={site.id}>
                  <button
                    type="button"
                    onClick={() => cycleSiteStatus(site.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-muted"
                  >
                    <StatusDot status={site.status} />
                    <span className="flex-1 text-foreground">{t(siteKey(site.id))}</span>
                    <span className="text-muted-foreground">
                      {mapStatus(t, site.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {t("demo.links")}
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
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-muted"
                    >
                      <StatusDot status={status} />
                      <span className="flex-1 text-foreground">
                        {from ? t(siteKey(from.id)) : link.from} →{" "}
                        {to ? t(siteKey(to.id)) : link.to}
                      </span>
                      <span className="text-muted-foreground">
                        {link.status ? mapStatus(t, link.status) : t("demo.inherited")}
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

function mapStatus(
  t: ReturnType<typeof useI18n>["t"],
  status: HealthStatus,
) {
  if (status === "down") return t("status.map.down");
  if (status === "degraded") return t("status.map.degraded");
  return t("status.map.up");
}

function StatusDot({ status }: { status: HealthStatus }) {
  return (
    <span
      className="size-2.5 rounded-full"
      style={{ backgroundColor: STATUS_HEX[status] }}
    />
  );
}
