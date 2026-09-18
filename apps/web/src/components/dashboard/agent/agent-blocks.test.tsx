import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentReasoning } from "@/components/dashboard/agent/agent-reasoning";
import { AgentMessageBubble } from "@/components/dashboard/agent/agent-message";
import { AgentStatusIcon } from "@/components/dashboard/agent/agent-status-icon";
import { AgentToolRow } from "@/components/dashboard/agent/agent-tool-row";
import { AgentSubagentCard } from "@/components/dashboard/agent/agent-subagent-card";
import { AgentPhaseRow } from "@/components/dashboard/agent/agent-phase";
import { renderWithProviders } from "@/test/render";

describe("agent building blocks", () => {
  it("renders reasoning with optional shimmer", () => {
    renderWithProviders(
      <AgentReasoning textKey="agent.reasoning.current" running />,
    );
    expect(screen.getByText(/Estoy gestionando la recuperación/)).toHaveClass("shimmer");
  });

  it("renders operator and agent message bubbles", () => {
    renderWithProviders(
      <>
        <AgentMessageBubble
          item={{
            id: "1",
            type: "message",
            role: "operator",
            text: "Hola agente",
            time: "10:20",
          }}
        />
        <AgentMessageBubble
          item={{
            id: "2",
            type: "message",
            role: "agent",
            textKey: "agent.followup.ack",
            time: "10:20",
          }}
        />
      </>,
    );
    expect(screen.getByText("Hola agente")).toBeInTheDocument();
    expect(screen.getByText(/Entendido/)).toBeInTheDocument();
  });

  it("renders status icons for every tool state", () => {
    const { container } = renderWithProviders(
      <>
        <AgentStatusIcon status="done" />
        <AgentStatusIcon status="running" />
        <AgentStatusIcon status="pending" />
        <AgentStatusIcon status="failed" />
      </>,
    );
    expect(container.querySelectorAll("span, svg").length).toBeGreaterThan(3);
  });

  it("renders a pending phase without an expand control body", () => {
    renderWithProviders(
      <AgentPhaseRow phase={{ id: "close", status: "pending" }} />,
    );
    expect(screen.getByText("Cerrando incidente")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  it("keeps a tool without detail non-expandable", () => {
    renderWithProviders(
      <AgentToolRow
        tool={{ id: "bare", name: "noop_tool", status: "done", time: "10:21" }}
      />,
    );
    expect(screen.getByRole("button", { name: /noop_tool/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("renders a pending subagent card", () => {
    renderWithProviders(
      <AgentSubagentCard
        subagent={{
          id: "sub-repsol",
          name: "Repsol",
          status: "pending",
          headlineKey: "agent.step.pending",
          tools: [],
        }}
      />,
    );
    expect(screen.getByText("Subagente · Repsol")).toBeInTheDocument();
  });
});
