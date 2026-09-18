import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";
import IncidentesPage from "@/app/incidentes/page";
import MigracionPage from "@/app/migracion/page";
import EmpresasPage from "@/app/empresas/page";
import InfraestructuraPage from "@/app/infraestructura/page";
import LogsPage from "@/app/logs/page";
import { renderWithProviders } from "@/test/render";

describe("app routes", () => {
  it("renders the overview on the home page", () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByRole("heading", { name: "Agente de Respuesta" })).toBeInTheDocument();
  });

  it.each([
    ["Incidentes", IncidentesPage],
    ["Migración", MigracionPage],
    ["Empresas", EmpresasPage],
    ["Infraestructura", InfraestructuraPage],
    ["Logs", LogsPage],
  ] as const)("renders the %s placeholder", (title, Page) => {
    renderWithProviders(<Page />);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });
});
