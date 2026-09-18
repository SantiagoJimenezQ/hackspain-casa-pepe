import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";
import { SpainMap } from "@/components/dashboard/spain-map";
import { renderWithProviders } from "@/test/render";

describe("OverviewDashboard", () => {
  it("renders the agent-first overview without the old live camera or global status cards", () => {
    renderWithProviders(<OverviewDashboard />);

    expect(
      screen.getByRole("heading", { name: "Caída del centro de datos de Madrid" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agente de Respuesta" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Empresas afectadas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Progreso de recuperación" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Estado de la infraestructura" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mapa de centros de datos en España" })).toBeInTheDocument();

    expect(screen.queryByText("Cámara en directo – Madrid DC")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Estado global" })).not.toBeInTheDocument();
  });

  it("switches the whole overview to English", () => {
    renderWithProviders(<OverviewDashboard />, { locale: "en" });
    expect(screen.getByRole("heading", { name: "Madrid data center outage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Response agent" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask the agent…")).toBeInTheDocument();
  });
});

describe("SpainMap", () => {
  it("exposes an accessible map and status legend", () => {
    renderWithProviders(<SpainMap />);
    const map = screen.getByRole("img", { name: "Mapa de centros de datos en España" });
    expect(map).toBeInTheDocument();
    expect(within(map.parentElement as HTMLElement).getByText("Operativo")).toBeInTheDocument();
    expect(within(map.parentElement as HTMLElement).getByText("Sin conexión")).toBeInTheDocument();
  });
});
