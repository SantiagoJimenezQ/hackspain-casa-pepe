import { proxyJSON } from "@/lib/casa-pepe-server";

export async function POST(request: Request) {
  const runIdentifier = new URL(request.url).searchParams.get("runIdentifier");
  const suffix = runIdentifier ? `?runIdentifier=${encodeURIComponent(runIdentifier)}` : "";
  return proxyJSON(`/agent/cycle${suffix}`, { method: "POST", body: await request.text() });
}
