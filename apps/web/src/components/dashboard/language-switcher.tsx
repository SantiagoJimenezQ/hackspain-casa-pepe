"use client";

import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { LOCALES, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const { switchLanguage, busyAction } = useDashboard();

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className="flex rounded-md border border-border bg-muted/50 p-0.5"
    >
      {LOCALES.map((code: Locale) => (
        <button
          key={code}
          type="button"
          onClick={() => void switchLanguage(code)}
          disabled={busyAction !== null}
          title={t("language.hint")}
          className={cn(
            "rounded-[5px] px-2 py-0.5 text-[11px] font-semibold tracking-wide transition-colors disabled:opacity-60",
            locale === code
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
