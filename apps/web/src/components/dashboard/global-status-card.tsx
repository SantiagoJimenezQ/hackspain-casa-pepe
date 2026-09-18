"use client";

import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { STATUS_HEX } from "@/lib/status";

export function GlobalStatusCard() {
  const { snapshot } = useDashboard();
  const { t } = useI18n();
  const { global } = snapshot;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dash = (global.onlinePercent / 100) * circumference;

  return (
    <Panel className="p-4">
      <h2 className="text-[13px] font-medium text-foreground">{t("global.title")}</h2>
      <div className="mt-3 flex items-center gap-5">
        <div className="relative size-[92px] shrink-0">
          <svg viewBox="0 0 92 92" className="size-full -rotate-90">
            <circle
              cx="46"
              cy="46"
              r={radius}
              fill="none"
              stroke="var(--muted)"
              strokeWidth="8"
            />
            <circle
              cx="46"
              cy="46"
              r={radius}
              fill="none"
              stroke="#f04444"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold text-foreground">
              {global.onlinePercent}%
            </span>
            <span className="text-[9px] tracking-wide text-muted-foreground">
              {t("global.servicesOnline")}
            </span>
          </div>
        </div>
        <ul className="space-y-1.5 text-[13px]">
          <LegendRow color={STATUS_HEX.up} label={t("global.active")} value={global.active} />
          <LegendRow
            color={STATUS_HEX.degraded}
            label={t("global.degraded")}
            value={global.degraded}
          />
          <LegendRow color={STATUS_HEX.down} label={t("global.down")} value={global.down} />
        </ul>
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        {t("global.companiesOnNetwork", { count: global.companiesOnNetwork })}
      </p>
    </Panel>
  );
}

function LegendRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium text-foreground">{value}</span>
    </li>
  );
}
