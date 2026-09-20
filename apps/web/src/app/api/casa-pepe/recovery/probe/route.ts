import { proxyJSON } from "@/lib/casa-pepe-server";

export async function POST(request: Request) {
  return proxyJSON("/recovery/probe", { method: "POST", body: await request.text() });
}
