import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapacityForm } from "./capacity-controls";
import { DeliveryProbeControl } from "./delivery-probe";
import { PlanComparison } from "./plan-comparison";
import { casaPepeClient } from "@/lib/casa-pepe-client";
import type { Incident, Overview, PlanComparison as Comparison } from "@/lib/casa-pepe-types";

vi.mock("@/components/i18n/locale-provider", () => ({useI18n: () => ({locale: "es"})}));
vi.mock("@/lib/casa-pepe-client", () => ({casaPepeClient: {changeCapacity: vi.fn(), probeDelivery: vi.fn()}}));
afterEach(() => vi.clearAllMocks());
const incident = {runIdentifier: "run-browser", active: true, runKind: "live", simulation: {mode: "manual"}, resources: [
  {identifier: "backup-oman", name: "Omán", region: "om", totalCapacity: 4, allocatedCapacity: 0},
  {identifier: "backup-frankfurt", name: "Baréin", region: "bh", totalCapacity: 12, allocatedCapacity: 3},
]} as Incident;
const overview = {incident, agent: {recoveryMode: "http"}, deliveryProbes: []} as unknown as Overview;
const priority = {serviceIdentifier: "orders", serviceName: "Pedidos", rank: 1, decision: "recover-now", reason: "Desbloquea el reparto", blockedBy: []};
const snapshot = {identifier: "p1", version: 1, summary: "Plan inicial", reason: "Primero los pedidos", resourceIdentifier: "backup-oman", resourceName: "Omán", totalCapacity: 4, plannedUnits: 4, priorities: [priority], steps: []};
const comparison: Comparison = {previous: snapshot, current: {...snapshot, identifier: "p2", version: 2, resourceName: "Baréin", reason: "Omán ya no tiene capacidad suficiente", totalCapacity: 12}, trigger: "Capacidad actualizada", capacityChanges: [{resourceIdentifier: "backup-oman", resourceName: "Omán", previousCapacity: 4, totalCapacity: 1, reason: "Fallo de suministro", occurredAt: "2026-09-20T10:00:00Z"}], changes: [], supersededApprovals: [{identifier: "a1", actionSummary: "Recuperar pedidos en Omán", reason: "El plan anterior ya no es válido"}]};

describe("demo controls", () => {
 it("sends the explicit run, selected datacenter, capacity and reason only on apply", async () => {
   const user = userEvent.setup(); const refresh = vi.fn();
   render(<CapacityForm incident={incident} refresh={refresh} />);
   const row = screen.getByRole("group", {name: "Omán"});
   await user.clear(within(row).getByRole("spinbutton")); await user.type(within(row).getByRole("spinbutton"), "1");
   expect(within(row).getByRole("button")).toBeDisabled();
   await user.type(screen.getByLabelText("Motivo del cambio"), "Fallo de suministro");
   expect(casaPepeClient.changeCapacity).not.toHaveBeenCalled();
   await user.click(within(row).getByRole("button"));
   expect(casaPepeClient.changeCapacity).toHaveBeenCalledWith({runIdentifier: "run-browser", resourceIdentifier: "backup-oman", totalCapacity: 1, reason: "Fallo de suministro"});
   expect(refresh).toHaveBeenCalled();
 })
 it("blocks capacity below allocations and displays backend errors", async () => {
   const user = userEvent.setup(); render(<CapacityForm incident={incident} refresh={vi.fn()} />);
   await user.type(screen.getByLabelText("Motivo del cambio"), "Cambio");
   const row = screen.getByRole("group", {name: "Baréin"});
   await user.clear(within(row).getByRole("spinbutton")); await user.type(within(row).getByRole("spinbutton"), "1");
   expect(within(row).getByRole("button")).toBeDisabled();
   await user.clear(within(row).getByRole("spinbutton")); await user.type(within(row).getByRole("spinbutton"), "8");
   vi.mocked(casaPepeClient.changeCapacity).mockRejectedValueOnce(new Error("Ejecución caducada"));
   await user.click(within(row).getByRole("button"));
   expect(await screen.findByText("Ejecución caducada")).toBeVisible();
 })
 it("renders persisted before/after, reasons and invalidated approvals without activity history", async () => {
   const user = userEvent.setup(); render(<PlanComparison comparison={comparison} />);
   await user.click(screen.getByRole("button", {name: "Comparar planes: v1 → v2"}));
   expect(await screen.findByRole("dialog")).toHaveTextContent("Omán: 4 → 1 unidades");
   expect(screen.getByRole("heading", {name: "Antes"})).toBeVisible();
   expect(screen.getByRole("heading", {name: "Ahora"})).toBeVisible();
   expect(screen.getByText("Aprobación anterior invalidada")).toBeVisible();
   expect(screen.getByText("El plan anterior ya no es válido")).toBeVisible();
   expect(screen.getAllByText("Desbloquea el reparto").filter(element => !element.closest("details"))).toHaveLength(2);
 })
 it("shows a persisted failure then an actual route returned by the server", async () => {
   const user = userEvent.setup(); const refresh = vi.fn();
   vi.mocked(casaPepeClient.probeDelivery).mockResolvedValueOnce({runIdentifier: "run-browser", checkedAt: "2026-09-20T10:01:00Z", mode: "http", verified: true, detail: "OK", deliveryIdentifier: "d1", routeIdentifier: "route-proof"});
   render(<DeliveryProbeControl overview={{...overview, deliveryProbes: [{runIdentifier: "run-browser", checkedAt: "2026-09-20T10:00:00Z", mode: "http", verified: false, detail: "Servicio caído", deliveryIdentifier: null, routeIdentifier: null}]}} refresh={refresh} />);
   await user.click(screen.getByRole("button", {name: "Probar servicio"}));
   expect(await screen.findByText("route-proof")).toBeVisible();
   expect(screen.getByText("Prueba anterior: Sin ruta válida")).toBeVisible();
   expect(casaPepeClient.probeDelivery).toHaveBeenCalledWith("run-browser");
   await waitFor(() => expect(refresh).toHaveBeenCalled());
 })
 it("never enables the functional check in simulated mode", () => {
   render(<DeliveryProbeControl overview={{...overview, agent: {...overview.agent, recoveryMode: "simulated"}}} refresh={vi.fn()} />);
   expect(screen.getByRole("button", {name: "Probar servicio"})).toBeDisabled();
 })
});
