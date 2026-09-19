import { describe, expect, it, vi } from "vitest";
import { proxyJSON } from "@/lib/casa-pepe-server";
import { GET } from "./route";

vi.mock("@/lib/casa-pepe-server", () => ({
  proxyJSON: vi.fn(),
}));

describe("LLM activity history proxy", () => {
  it("forwards the run cursor without exposing the backend API key to the browser", async () => {
    vi.mocked(proxyJSON).mockResolvedValue(Response.json({ items: [], nextBeforeSequence: null }));

    await GET(new Request("http://localhost/api/casa-pepe/activity/llm?runIdentifier=run_1&limit=50&beforeSequence=12"));

    expect(proxyJSON).toHaveBeenCalledWith(
      "/activity/llm?runIdentifier=run_1&limit=50&beforeSequence=12",
    );
  });
});
