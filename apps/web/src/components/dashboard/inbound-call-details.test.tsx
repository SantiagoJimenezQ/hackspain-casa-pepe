import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InboundCallDetails } from "./inbound-call-details";

describe("inbound call instructions", () => {
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
