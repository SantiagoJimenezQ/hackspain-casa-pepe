import { expect, it, vi } from "vitest";
const proxy = vi.hoisted(() => vi.fn(async () => Response.json({ unchanged: true, revision: "abc" })));
vi.mock("@/lib/casa-pepe-server", () => ({ proxyJSON: proxy }));
import { GET } from "./route";

it("forwards snapshot revisions and run scope through the authenticated proxy", async () => {
  const response = await GET(new Request("https://example.test/api/casa-pepe/overview?runIdentifier=run_1&knownRevision=abc&ignored=value"));
  expect(proxy).toHaveBeenCalledWith("/overview?runIdentifier=run_1&knownRevision=abc");
  expect(await response.json()).toEqual({ unchanged: true, revision: "abc" });
});
