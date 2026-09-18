"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { THEMES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("theme.label")}
      className="flex rounded-md border border-border bg-muted/50 p-0.5"
    >
      {THEMES.map((value: Theme) => {
        const Icon = value === "dark" ? Moon : Sun;
        const label = value === "dark" ? t("theme.dark") : t("theme.light");
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            title={label}
            aria-label={label}
            className={cn(
              "flex size-6 items-center justify-center rounded-[5px] transition-colors",
              theme === value
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
