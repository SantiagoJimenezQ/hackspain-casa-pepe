import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IncidentCard } from "@/components/dashboard/incident-card";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { MigrationCard } from "@/components/dashboard/migration-card";
import { InfrastructureCard } from "@/components/dashboard/infrastructure-card";
import { GlobalStatusCard } from "@/components/dashboard/global-status-card";
import { AffectedSummaryCard } from "@/components/dashboard/affected-summary-card";
import { LiveCameraCard } from "@/components/dashboard/live-camera-card";
import { PlaceholderView } from "@/components/dashboard/placeholder-view";
import { Panel } from "@/components/dashboard/panel";
import { renderWithProviders } from "@/test/render";

describe("dashboard cards", () => {
  it("renders the incident header and KPIs", () => {
    renderWithProviders(<IncidentCard />);
    expect(
      screen.getByRole("heading", { name: "Caída del centro de datos de Madrid" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Empresas afectadas")).toBeInTheDocument();
    expect(screen.getByText("12.480")).toBeInTheDocument();
    expect(screen.getByText("7 min")).toBeInTheDocument();
    expect(screen.getByText(/Madrid DC/)).toBeInTheDocument();
  });

  it("lists affected companies with status and a view-all link", () => {
    renderWithProviders(<CompaniesTable />);
    expect(screen.getByRole("heading", { name: "Empresas afectadas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todas" })).toHaveAttribute("href", "/empresas");
    expect(screen.getByText("Iberdrola")).toBeInTheDocument();
    expect(screen.getAllByText("Migrando").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sin conexión").length).toBeGreaterThan(0);
  });

  it("shows recovery progress from the agent phases", () => {
    renderWithProviders(<MigrationCard />);
    expect(screen.getByRole("heading", { name: "Progreso de recuperación" })).toBeInTheDocument();
    expect(screen.getByText("Analizando el incidente")).toBeInTheDocument();
    expect(screen.getByText("Lanzando subagentes")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders infrastructure chips", () => {
    renderWithProviders(<InfrastructureCard />);
    expect(
      screen.getByRole("heading", { name: "Estado de la infraestructura" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Madrid (Principal)")).toBeInTheDocument();
    expect(screen.getByLabelText("Ver todo")).toHaveAttribute("href", "/infraestructura");
  });

  it("renders global status, impact summary and live camera", () => {
    renderWithProviders(
      <>
        <GlobalStatusCard />
        <AffectedSummaryCard />
        <LiveCameraCard />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Estado global" })).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Empresas afectadas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cámara en directo – Madrid DC" })).toBeInTheDocument();
    expect(screen.getByText("10:17:03")).toBeInTheDocument();
  });

  it("renders placeholder copy for unfinished routes", () => {
    renderWithProviders(<PlaceholderView titleKey="nav.logs" />);
    expect(screen.getByRole("heading", { name: "Logs" })).toBeInTheDocument();
    expect(screen.getByText(/el diseño completo vive en Visión general/i)).toBeInTheDocument();
  });

  it("renders a panel shell", () => {
    renderWithProviders(<Panel>contenido</Panel>);
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});
