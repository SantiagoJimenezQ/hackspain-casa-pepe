import { proxyJSON } from "@/lib/casa-pepe-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  for (const key of ["runIdentifier", "mode"]) {
    const value = incoming.get(key);
    if (value) forwarded.set(key, value);
  }
  const suffix = forwarded.size ? `?${forwarded.toString()}` : "";
  return proxyJSON(`/customers/priorities${suffix}`);
}
