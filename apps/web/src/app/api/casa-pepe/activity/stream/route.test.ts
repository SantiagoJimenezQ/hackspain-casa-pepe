import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backendFetch } from "@/lib/casa-pepe-server";
import { GET } from "./route";

vi.mock("@/lib/casa-pepe-server", () => ({
  backendFetch: vi.fn(),
  BackendAPIError: class extends Error {},
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ cancel });
  vi.mocked(backendFetch).mockResolvedValue(new Response(stream));
  return { cancel };
}

describe("activity stream proxy", () => {
  it("forwards the reconnect cursor and ends stalled streams before the runtime deadline", async () => {
    const { cancel } = setup();
    const response = await GET(new Request("http://localhost/api/casa-pepe/activity/stream?afterSequence=1", {
      headers: { "Last-Event-ID": "42" },
    }));
    const init = vi.mocked(backendFetch).mock.calls[0][1]!;
    expect(new Headers(init.headers).get("last-event-id")).toBe("42");
    const pending = response.body!.getReader().read();
    await vi.advanceTimersByTimeAsync(250_000);
    expect(await pending).toEqual({ done: true, value: undefined });
    expect(init.signal!.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels upstream when the browser disconnects", async () => {
    const { cancel } = setup();
    const browser = new AbortController();
    const response = await GET(new Request("http://localhost/stream", { signal: browser.signal }));
    browser.abort();
    expect(await response.body!.getReader().read()).toEqual({ done: true, value: undefined });
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels upstream when the response consumer cancels", async () => {
    const { cancel } = setup();
    const response = await GET(new Request("http://localhost/stream"));
    await response.body!.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes event bytes through and clears the timer on normal completion", async () => {
    vi.mocked(backendFetch).mockResolvedValue(new Response("id: 42\nevent: test\ndata: {}\n\n"));
    const response = await GET(new Request("http://localhost/stream"));
    expect(await response.text()).toBe("id: 42\nevent: test\ndata: {}\n\n");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer when opening the upstream fails", async () => {
    vi.mocked(backendFetch).mockRejectedValue(new Error("unavailable"));
    const response = await GET(new Request("http://localhost/stream"));
    expect(response.status).toBe(502);
    expect(vi.getTimerCount()).toBe(0);
  });
});
