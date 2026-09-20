import { expect, it, vi } from "vitest";
import { POST } from "./route";
import { proxyJSON } from "@/lib/casa-pepe-server";
vi.mock("@/lib/casa-pepe-server", () => ({proxyJSON: vi.fn().mockResolvedValue(new Response("{}"))}));
it("forwards the explicit run to the authenticated backend probe", async () => {
 const body = JSON.stringify({runIdentifier: "run-1"});
 await POST(new Request("http://localhost/api/casa-pepe/recovery/probe", {method: "POST", body}));
 expect(proxyJSON).toHaveBeenCalledWith("/recovery/probe", {method: "POST", body});
});
