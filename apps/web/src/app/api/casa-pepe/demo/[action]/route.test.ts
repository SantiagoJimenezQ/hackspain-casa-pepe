import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { proxyJSON } from "@/lib/casa-pepe-server";
vi.mock("@/lib/casa-pepe-server", () => ({proxyJSON: vi.fn().mockResolvedValue(new Response("{}"))}));
beforeEach(() => vi.clearAllMocks());
describe("capacity proxy", () => {
 it("forwards the explicit run, resource and reason in the body", async () => {
  const body = JSON.stringify({runIdentifier: "run-1", resourceIdentifier: "backup-oman", totalCapacity: 1, reason: "Mantenimiento"});
  await POST(new Request("http://localhost/api/casa-pepe/demo/capacity", {method: "POST", body}), {params: Promise.resolve({action: "capacity"})});
  expect(proxyJSON).toHaveBeenCalledWith("/demo/capacity", {method: "POST", body});
 });
 it("does not open an arbitrary backend proxy", async () => {
  const response = await POST(new Request("http://localhost/api/casa-pepe/demo/events", {method: "POST"}), {params: Promise.resolve({action: "events"})});
  expect(response.status).toBe(404); expect(proxyJSON).not.toHaveBeenCalled();
 });
});
