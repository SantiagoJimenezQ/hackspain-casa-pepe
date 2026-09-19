import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { DecisionCard } from "./decision-card";
import type { Decision } from "@/lib/agent-decisions";
const decision: Decision = { id: "A:X", sequence: 1, occurredAt: "now", text: "Restore orders first", disposition: "accepted", redacted: false, toolCalls: [{ name: "execute_step", arguments: { stepIdentifier: "orders" } }] };
describe("decision card", () => {
 it("V06 distinguishes accepted decisions from execution", () => {
  render(<LocaleProvider><DecisionCard decision={decision} /></LocaleProvider>);
  expect(screen.getByText(/ejecución y la verificación|Execution and verification/)).toBeVisible();
  expect(screen.queryByText(/^Verified$|^Verificado$/)).not.toBeInTheDocument();
 });
 it("V09 shows complete text safely and identifies redaction", () => {
  const text = '<img src=x onerror=alert(1)>' + 'a'.repeat(3000);
  const { container } = render(<LocaleProvider><DecisionCard decision={{ ...decision, text, redacted: true }} /></LocaleProvider>);
  expect(screen.getByText(text)).toBeVisible();
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText(/Datos sensibles ocultos|Sensitive data redacted/)).toBeVisible();
 });
 it("V13 opens action details using the keyboard", async () => {
  const user = userEvent.setup();
  render(<LocaleProvider><DecisionCard decision={decision} /></LocaleProvider>);
  await user.tab(); await user.keyboard("{Enter}");
  expect(screen.getByText(/"execute_step"/)).toBeVisible();
 });
});
