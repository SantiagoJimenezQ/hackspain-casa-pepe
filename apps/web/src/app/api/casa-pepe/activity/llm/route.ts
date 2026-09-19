import { proxyJSON } from "@/lib/casa-pepe-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["runIdentifier", "limit", "beforeSequence"]) {
    const value = incoming.get(key);
    if (value) query.set(key, value);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  return proxyJSON(`/activity/llm${suffix}`);
}
