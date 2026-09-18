import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTheme } from "@/components/theme/theme-provider";
import { useI18n } from "@/components/i18n/locale-provider";
import { renderWithProviders } from "@/test/render";

function ThemeProbe() {
  const { theme } = useTheme();
  return <p>{theme}</p>;
}

function LocaleProbe() {
  const { locale } = useI18n();
  return <p>{locale}</p>;
}

describe("providers", () => {
  it("throws when theme is used without a provider", () => {
    expect(() => render(<ThemeProbe />)).toThrow(/useTheme must be used within ThemeProvider/);
  });

  it("throws when i18n is used without a provider", () => {
    expect(() => render(<LocaleProbe />)).toThrow(/useI18n must be used within LocaleProvider/);
  });

  it("reads the stored theme and locale", () => {
    renderWithProviders(
      <>
        <ThemeProbe />
        <LocaleProbe />
      </>,
      { theme: "light", locale: "en" },
    );
    expect(screen.getByText("light")).toBeInTheDocument();
    expect(screen.getByText("en")).toBeInTheDocument();
  });
});
