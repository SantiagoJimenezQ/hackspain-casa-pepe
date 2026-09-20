import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { BROWSER_SESSION_COOKIE, BROWSER_SESSION_HEADER } from "./browser-session";
import { backendFetch } from "./casa-pepe-server";

const state = vi.hoisted(() => ({ token: "a".repeat(64), headers: new Headers() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }), headers: async () => state.headers }));

beforeEach(() => {
 vi.restoreAllMocks();
 state.token = "a".repeat(64);
 state.headers = new Headers({ host: "demo.test", origin: "https://demo.test" });
 vi.stubEnv("CASA_PEPE_API_BASE_URL", "https://backend.test/api");
 vi.stubEnv("CASA_PEPE_API_KEY", "synthetic-test-key");
});

describe("anonymous browser identity", () => {
 it("issues different secure HttpOnly cookies to independent browser documents", () => {
  const a = proxy(new NextRequest("https://demo.test/"));
  const b = proxy(new NextRequest("https://demo.test/"));
  const first = a.cookies.get(BROWSER_SESSION_COOKIE)!;
  expect(first.value).toMatch(/^[a-f0-9]{64}$/);
  expect(first.value).not.toBe(b.cookies.get(BROWSER_SESSION_COOKIE)?.value);
  expect(first).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
 });
 it("keeps the browser token on refresh and another tab", () => {
  const response = proxy(new NextRequest("https://demo.test/", { headers: { cookie: `${BROWSER_SESSION_COOKIE}=${state.token}` } }));
  expect(response.headers.get("set-cookie")).toBeNull();
 });
 it("does not mint competing cookies for parallel API requests", () => {
  expect(proxy(new NextRequest("https://demo.test/api/casa-pepe/overview")).status).toBe(401);
 });
 it("forwards the cookie and overrides a forged session header", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await backendFetch("/overview", { headers: { [BROWSER_SESSION_HEADER]: "b".repeat(64) } });
  const headers = new Headers(fetch.mock.calls[0][1]?.headers);
  expect(headers.get(BROWSER_SESSION_HEADER)).toBe(state.token);
  expect(headers.get("authorization")).toBe("API synthetic-test-key");
 });
 it("rejects missing cookies without contacting the backend", async () => {
  state.token = "";
  const fetch = vi.spyOn(globalThis, "fetch");
  await expect(backendFetch("/overview")).rejects.toMatchObject({ status: 401 });
  expect(fetch).not.toHaveBeenCalled();
 });
 it("rejects cross-origin mutations", async () => {
  state.headers.set("origin", "https://other.test");
  await expect(backendFetch("/demo/reset", { method: "POST" })).rejects.toMatchObject({ status: 403 });
 });
});
