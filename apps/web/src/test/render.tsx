import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { DashboardProvider } from "@/components/dashboard/dashboard-provider";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LOCALE_STORAGE_KEY, type Locale } from "@/lib/i18n";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ThemeProvider>
        <LocaleProvider>
          <DashboardProvider>{children}</DashboardProvider>
        </LocaleProvider>
      </ThemeProvider>
    </TooltipProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & {
    locale?: Locale;
    theme?: Theme;
  },
) {
  if (options?.locale) {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, options.locale);
  }
  if (options?.theme) {
    window.localStorage.setItem(THEME_STORAGE_KEY, options.theme);
  }

  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: Providers, ...options }),
  };
}
