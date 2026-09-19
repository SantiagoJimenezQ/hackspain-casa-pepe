import { proxyJSON } from "@/lib/casa-pepe-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams;
  const run = source.get("runIdentifier");
  if (!run || !/^[a-zA-Z0-9_-]{1,200}$/.test(run)) return Response.json({ message: "Invalid run identifier" }, { status: 400 });
  const query = new URLSearchParams({ runIdentifier: run, limit: "100" });
  for (const key of ["limit", "beforeSequence"]) {
    const value = source.get(key);
    if (value === null) continue;
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || (key === "limit" && Number(value) > 500)) {
      return Response.json({ message: "Invalid history cursor or limit" }, { status: 400 });
    }
    query.set(key, value);
  }
  return proxyJSON(`/activity/llm?${query}`, { signal: request.signal });
}
