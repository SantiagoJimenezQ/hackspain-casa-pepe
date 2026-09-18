"use client";

import { Panel } from "@/components/dashboard/panel";
import { useI18n } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n";

export function PlaceholderView({ titleKey }: { titleKey: MessageKey }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Panel className="max-w-lg p-8 text-center">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Casa Pepe
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{t(titleKey)}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("placeholder.body")}
        </p>
      </Panel>
    </div>
  );
}
