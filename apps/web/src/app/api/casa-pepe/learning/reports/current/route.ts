import { proxyJSON } from "@/lib/casa-pepe-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const runIdentifier = new URL(request.url).searchParams.get("runIdentifier");
  const suffix = runIdentifier ? `?runIdentifier=${encodeURIComponent(runIdentifier)}` : "";
  return proxyJSON(`/learning/reports/current${suffix}`);
}
