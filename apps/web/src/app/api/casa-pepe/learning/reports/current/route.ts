import { proxyJSON } from "@/lib/casa-pepe-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJSON("/learning/reports/current");
}
