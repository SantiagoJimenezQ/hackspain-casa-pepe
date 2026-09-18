import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DemoDrawer } from "@/components/dashboard/demo-drawer";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher";
import { ThemeSwitcher } from "@/components/dashboard/theme-switcher";
import { TopBar } from "@/components/dashboard/top-bar";
import { IncidentCard } from "@/components/dashboard/incident-card";
import { renderWithProviders } from "@/test/render";

describe("shell chrome", () => {
  it("renders navigation, agent chip and clock in the top bar", () => {
    renderWithProviders(<TopBar />);
    expect(screen.getByRole("link", { name: "Casa Pepe" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Visión general" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Logs" })).toHaveAttribute("href", "/logs");
    expect(screen.getByText("Agente IA activo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Demo" })).toBeInTheDocument();
  });

  it("wraps page content in a main landmark", () => {
    renderWithProviders(
      <DashboardShell>
        <p>contenido</p>
      </DashboardShell>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("contenido");
  });

  it("switches language from the top bar control", async () => {
    const { user } = renderWithProviders(
      <>
        <LanguageSwitcher />
        <IncidentCard />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(
      screen.getByRole("heading", { name: "Madrid data center outage" }),
    ).toBeInTheDocument();
  });

  it("toggles theme from the top bar control", async () => {
    const { user } = renderWithProviders(<ThemeSwitcher />);
    await user.click(screen.getByRole("button", { name: "Claro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Oscuro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("opens demo controls with the D shortcut and advances the agent", async () => {
    const { user } = renderWithProviders(<DemoDrawer />);
    await user.keyboard("d");
    expect(screen.getByRole("heading", { name: "Controles de demo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avanzar agente" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Iniciar escenario" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Avanzar agente" }));
    await user.click(screen.getByRole("button", { name: "Reiniciar" }));
  });

  it("does not open the demo drawer while typing in an input", async () => {
    const { user } = renderWithProviders(
      <>
        <input aria-label="campo" />
        <DemoDrawer />
      </>,
    );
    await user.click(screen.getByLabelText("campo"));
    await user.keyboard("d");
    expect(screen.queryByRole("heading", { name: "Controles de demo" })).not.toBeInTheDocument();
  });
});
