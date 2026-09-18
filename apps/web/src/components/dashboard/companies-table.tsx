"use client";

import { Panel } from "@/components/dashboard/panel";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { formatEsNumber } from "@/lib/format";
import { companyStatusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/dashboard-types";

export function CompaniesTable() {
  const { snapshot } = useDashboard();

  return (
    <Panel className="min-h-0">
      <div className="px-4 py-3">
        <h2 className="text-[13px] font-medium text-white">Empresas afectadas</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[11px] text-muted-foreground">
            <tr>
              <th className="px-2 pb-2 font-medium">Empresa</th>
              <th className="px-2 pb-2 font-medium">Sector</th>
              <th className="px-2 pb-2 font-medium">Estado</th>
              <th className="px-2 pb-2 font-medium">Usuarios</th>
              <th className="px-2 pb-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.companies.map((company) => (
              <tr key={company.id} className="border-t border-white/5">
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <CompanyMark company={company} />
                    <span className="font-medium text-white">{company.name}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{company.sector}</td>
                <td className="px-2 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        company.status === "down" && "bg-status-down",
                        company.status === "degraded" && "bg-status-degraded",
                        company.status === "up" && "bg-status-up",
                      )}
                    />
                    {companyStatusLabel(company.status)}
                  </span>
                </td>
                <td className="px-2 py-1.5 tabular-nums text-white">
                  {formatEsNumber(company.users)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium",
                      company.action === "migrating"
                        ? "bg-sky-400/12 text-sky-300"
                        : "bg-white/6 text-muted-foreground",
                    )}
                  >
                    {company.action === "migrating" ? "Migrando" : "En cola"}
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
