"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { formatNumber } from "@/lib/format";
import { sectorKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/dashboard-types";

export function CompaniesTable() {
  const { snapshot } = useDashboard();
  const { locale, t } = useI18n();

  return (
    <Panel className="min-h-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="text-[13px] font-medium text-foreground">
          {t("companies.title")}
        </h2>
        <Link
          href="/empresas"
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {t("companies.seeAll")}
        </Link>
      </div>
      <div className="scroll-fade min-h-0 flex-1 overflow-auto px-2 pb-2">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[11px] text-muted-foreground">
            <tr>
              <th className="px-2 pb-2 font-medium">{t("companies.company")}</th>
              <th className="px-2 pb-2 font-medium">{t("companies.sector")}</th>
              <th className="px-2 pb-2 font-medium">{t("companies.status")}</th>
              <th className="px-2 pb-2 text-right font-medium">
                {t("companies.users")}
              </th>
              <th className="px-2 pb-2" />
            </tr>
          </thead>
          <tbody>
            {snapshot.companies.map((company) => (
              <tr key={company.id} className="border-t border-border">
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <CompanyMark company={company} />
                    <span className="font-medium text-foreground">
                      {company.name}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 text-muted-foreground">
                  {t(sectorKey(company.sector))}
                </td>
                <td className="px-2 py-2">
                  <CompanyStatus company={company} />
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-foreground">
                  {formatNumber(company.users, locale)}
                </td>
                <td className="px-1 py-2 text-right">
                  <ChevronRight
                    className="inline size-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="sr-only">
                    {t("companies.open", { name: company.name })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CompanyStatus({ company }: { company: Company }) {
  const { t } = useI18n();
  const migrating = company.action === "migrating";
  const label = migrating
    ? t("companies.migrating")
    : company.status === "down"
      ? t("companies.offline")
      : company.status === "degraded"
        ? t("status.company.degraded")
        : t("status.company.up");

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "size-1.5 rounded-full",
          migrating && "bg-status-degraded",
          !migrating && company.status === "down" && "bg-status-down",
          !migrating && company.status === "degraded" && "bg-status-degraded",
          !migrating && company.status === "up" && "bg-status-up",
        )}
      />
      <span
        className={cn(
          migrating && "text-status-degraded",
          !migrating && company.status === "down" && "text-status-down",
          !migrating && company.status === "degraded" && "text-status-degraded",
          !migrating && company.status === "up" && "text-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
}

function CompanyMark({ company }: { company: Company }) {
  return (
    <span
      className="flex size-5 items-center justify-center rounded-sm text-[9px] font-bold text-white"
      style={{ backgroundColor: company.accent }}
    >
      {company.shortName.slice(0, 1)}
    </span>
  );
}
