import { proxyJSON } from "@/lib/casa-pepe-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const params = new URLSearchParams();
  for (const name of ["runIdentifier", "knownRevision"]) {
    const value = incoming.get(name);
    if (value) params.set(name, value);
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return proxyJSON(`/overview${suffix}`);
}
