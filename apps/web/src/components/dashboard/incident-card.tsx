"use client";

import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { formatNumber } from "@/lib/format";

export function IncidentCard() {
  const { snapshot } = useDashboard();
  const { locale, t } = useI18n();
  const { incident, impact, global } = snapshot;

  const kpis = [
    {
      value: String(impact.companiesTotal),
      label: t("incident.kpi.companies"),
    },
    {
      value: formatNumber(impact.usersOffline, locale),
      label: t("incident.kpi.users"),
    },
    {
      value: `${global.down} / ${global.companiesOnNetwork}`,
      label: t("incident.kpi.critical"),
    },
    {
      value: t("incident.kpi.minutes", { minutes: incident.elapsedMinutes }),
      label: t("incident.kpi.elapsed"),
    },
  ];

  return (
    <Panel className="min-h-0 justify-between p-4">
      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-red-500 dark:text-red-400">
            <span className="size-2 rounded-full bg-status-down shadow-[0_0_10px_#f04444]" />
            {t("incident.critical")}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {incident.localTime} · {t("incident.location")}
          </p>
        </div>
        <h1 className="text-[32px] leading-9 font-semibold tracking-tight text-foreground">
          {t("incident.title")}
        </h1>
        <p className="mt-3 max-w-[40ch] text-[13px] leading-5 text-muted-foreground">
          {t("incident.description")}
        </p>
      </div>
      <dl className="mt-5 grid grid-cols-4 gap-x-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="min-w-0">
            <dd className="text-[20px] leading-6 font-semibold tracking-tight text-foreground tabular-nums">
              {kpi.value}
            </dd>
            <dt className="mt-1 text-[11px] leading-4 text-muted-foreground">{kpi.label}</dt>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
