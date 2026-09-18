import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentPanel } from "@/components/dashboard/agent/agent-panel";
import { AgentCard } from "@/components/dashboard/agent-card";
import { renderWithProviders } from "@/test/render";

describe("AgentPanel", () => {
  it("renders reasoning, tools, subagents and an enabled composer", () => {
    renderWithProviders(<AgentPanel />);
    expect(screen.getByRole("heading", { name: "Agente de Respuesta" })).toBeInTheDocument();
    expect(screen.getByText(/Estoy gestionando la recuperación/)).toBeInTheDocument();
    expect(screen.getByText("get_incident_logs")).toBeInTheDocument();
    expect(screen.getByText("create_recovery_plan")).toBeInTheDocument();
    expect(screen.getByText("Subagente · Iberdrola")).toBeInTheDocument();
    expect(screen.getByText("Subagente · Santander")).toBeInTheDocument();
    expect(screen.getByText("Subagente · Telefónica")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Pregunta al agente…")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("expands a tool call to show the detail", async () => {
    const { user } = renderWithProviders(<AgentPanel />);
    await user.click(screen.getByRole("button", { name: /get_incident_logs/ }));
    expect(await screen.findByText(/Recolectados 1.2 MB/)).toBeInTheDocument();
  });

  it("expands a subagent card to show nested tools and reasoning", async () => {
    const { user } = renderWithProviders(<AgentPanel />);
    await user.click(screen.getByRole("button", { name: /Subagente · Iberdrola/ }));
    expect(await screen.findByText(/Replicando volúmenes críticos de Iberdrola/)).toBeInTheDocument();
    expect(screen.getByText("replicate_volumes")).toBeInTheDocument();
    expect(screen.getByText("sync_services")).toBeInTheDocument();
  });

  it("sends a follow-up while the agent is still working", async () => {
    const { user } = renderWithProviders(<AgentPanel />);
    const input = screen.getByLabelText("Pregunta al agente…");
    await user.type(input, "Prioriza Telefónica");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Prioriza Telefónica")).toBeInTheDocument();
    expect(
      screen.getByText(/Entendido. Sigo con la migración de empresas críticas/),
    ).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("does not send whitespace-only follow-ups", async () => {
    const { user } = renderWithProviders(<AgentPanel />);
    await user.type(screen.getByLabelText("Pregunta al agente…"), "   ");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("copies the current reasoning", async () => {
    const { user } = renderWithProviders(<AgentPanel />);
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    await user.click(screen.getByRole("button", { name: "Copiar razonamiento" }));
    expect(writeText).toHaveBeenCalled();
    expect(String(writeText.mock.calls[0]?.[0])).toMatch(/caída del DC de Madrid/i);
    expect(screen.getByRole("button", { name: "Copiado" })).toBeInTheDocument();
  });
});

describe("AgentCard", () => {
  it("re-exports the agent panel", () => {
    renderWithProviders(<AgentCard />);
    expect(screen.getByRole("heading", { name: "Agente de Respuesta" })).toBeInTheDocument();
  });
});
