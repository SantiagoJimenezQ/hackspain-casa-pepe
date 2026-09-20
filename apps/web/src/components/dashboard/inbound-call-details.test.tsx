import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InboundCallDetails } from "./inbound-call-details";

describe("inbound call instructions", () => {
  it("opens localized priority instructions and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<InboundCallDetails callCode="123456" phoneNumber="+12603688621" available locale="es" />);
    const trigger = screen.getByRole("button", { name: "Cómo priorizar una empresa" });
    await user.click(trigger);
    expect(await screen.findByRole("dialog")).toHaveTextContent("Prioriza una empresa por teléfono");
    expect(screen.getByRole("dialog")).toHaveTextContent("123 456, el nombre de la empresa");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("explains unavailable calling in English and closes with its button", async () => {
    const user = userEvent.setup();
    render(<InboundCallDetails available={false} locale="en" />);
    await user.click(screen.getByRole("button", { name: "How to prioritize a company" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("You need an active, unresolved incident");
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a readable incident code beside the real dial link", () => {
    render(<InboundCallDetails callCode="123456" phoneNumber="+12603688621" available locale="es" />);
    expect(screen.getByText("123 456")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+12603688621" })).toHaveAttribute("href", "tel:+12603688621");
    expect(screen.getByText("Di este código y la empresa que necesitas priorizar.")).toBeInTheDocument();
  });
  it("does not invent a code or phone number for an older API response", () => {
    render(<InboundCallDetails available={false} locale="en" />);
    expect(screen.getByText("Number unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Requests require an active, unresolved incident.")).toBeInTheDocument();
  });
});
