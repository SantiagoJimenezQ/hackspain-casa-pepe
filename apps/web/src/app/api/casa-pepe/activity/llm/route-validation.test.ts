import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "./route";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("decision history proxy", () => {
 it.each(["runIdentifier=A&limit=0", "runIdentifier=A&limit=501", "runIdentifier=A&beforeSequence=-1", "runIdentifier=A&beforeSequence=NaN", "runIdentifier=A&beforeSequence=9007199254740992", "runIdentifier="])("V12 rejects invalid query %s", async (query) => {
  const fetch = vi.spyOn(globalThis,"fetch");
  expect((await GET(new Request(`http://localhost/api?${query}`))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
 });
 it("V12 forwards only supported fields with server-side auth", async () => {
  vi.stubEnv("CASA_PEPE_API_BASE_URL","https://example.test/api"); vi.stubEnv("CASA_PEPE_API_KEY","synthetic-test-key");
  const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue(Response.json({ items:[], nextBeforeSequence:null }));
  const response=await GET(new Request("http://localhost/api?runIdentifier=A&beforeSequence=12&apiKey=untrusted"));
  expect(response.status).toBe(200);
  expect(fetch.mock.calls[0][0]).toBe("https://example.test/api/activity/llm?runIdentifier=A&limit=100&beforeSequence=12");
  expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Authorization")).toBe("API synthetic-test-key");
  expect(await response.text()).not.toContain("synthetic-test-key");
 });
 it("V12 returns a readable upstream failure", async () => {
  vi.stubEnv("CASA_PEPE_API_BASE_URL","https://example.test/api"); vi.stubEnv("CASA_PEPE_API_KEY","synthetic-test-key");
  vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("private transport detail"));
  const response=await GET(new Request("http://localhost/api?runIdentifier=A"));
  expect(response.status).toBe(502); expect(await response.text()).not.toContain("private transport detail");
 });
});
